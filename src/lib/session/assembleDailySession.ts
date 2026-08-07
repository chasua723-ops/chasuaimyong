import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { calculateDailyRange } from '@/lib/pacing';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '@/lib/adaptive';
import { generateQuestions } from '@/lib/ai/generateQuestions';
import { generateFromRandomPage } from '@/lib/quiz/generateFromRandomPage';
import { curateVocab } from '@/lib/ai/curateVocab';

/** A question row built in memory, before a session id exists to attach it to. */
interface PendingQuestion {
  book_id: string;
  type: string;
  source_page: number;
  prompt: string;
  choices: string[] | null;
  correct_answer: string;
  used_reference: boolean;
}

const QUESTIONS_PER_BOOK = 3;

export async function assembleDailySession(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  today: string
) {
  const { data: existing, error: existingError } = await (supabase.from('daily_sessions') as any)
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to fetch daily session: ${existingError.message}`);

  if (existing) return existing;

  const { data: books, error: booksError } = await (supabase.from('books') as any).select('*');
  if (booksError) throw new Error(`Failed to fetch books: ${booksError.message}`);
  if (!books || books.length === 0) throw new Error('No books found');

  const { data: statsRows, error: statsError } = await (supabase.from('category_stats') as any).select('*');
  if (statsError) throw new Error(`Failed to fetch category stats: ${statsError.message}`);
  const stats: CategoryStat[] = (statsRows ?? []).map((r: any) => ({
    type: r.type,
    correctCount: r.correct_count,
    totalCount: r.total_count,
  }));
  const weights = calculateWeights(stats);

  const dayIndex = Math.floor(new Date(today).getTime() / (1000 * 60 * 60 * 24));
  const essayBook = books[dayIndex % books.length];

  // Everything that can throw (AI generation, curation) happens BEFORE the
  // daily_sessions insert, so a partial failure leaves no session row behind and
  // the next request retries from scratch instead of returning a dead session.
  const pendingQuestions: PendingQuestion[] = [];

  for (const book of books) {
    const range = calculateDailyRange({
      totalPages: book.total_pages,
      examDate: book.exam_date,
      today,
      targetReadCount: book.target_read_count,
      currentReadCount: book.current_read_count,
      currentPage: book.current_page,
    });

    const quizWeights = Object.fromEntries(
      QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
    ) as Record<(typeof QUIZ_TYPES)[number], number>;
    const types = pickWeightedTypes(quizWeights as any, QUESTIONS_PER_BOOK);

    // Quiz questions are sourced from the book's full range covered by today (1..endPage),
    // not just today's assigned slice, so review of earlier material is mixed in for spaced
    // retrieval practice. Each question gets its own independently random page.
    for (const type of types) {
      const generated = await generateFromRandomPage(supabase, aiClient, {
        bookId: book.id,
        bookName: book.name,
        maxPage: Math.max(1, range.endPage),
        type,
      });
      pendingQuestions.push({
        book_id: book.id,
        type: generated.type,
        source_page: generated.sourcePage,
        prompt: generated.prompt,
        choices: generated.choices ?? null,
        correct_answer: generated.correctAnswer,
        used_reference: generated.usedReference,
      });
    }

    if (book.id === essayBook.id) {
      const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
        .select('page_num, content')
        .eq('book_id', book.id)
        .gte('page_num', range.startPage)
        .lte('page_num', range.endPage);
      if (pagesError) throw new Error(`Failed to fetch book pages: ${pagesError.message}`);
      const pageRange = (pages ?? []).map((p: any) => ({ pageNum: p.page_num, content: p.content }));

      // Claude sometimes returns a sourcePage outside the excerpt it was given.
      // Persisting that would break the later book_pages lookup in recordEssayAttempt,
      // silently degrading the RAG grounding to an empty page while the UI still claims
      // "(N페이지 참고)".
      const clampPage = (page: number) =>
        Math.min(Math.max(Number(page) || range.startPage, range.startPage), range.endPage);

      const essayGenerated = await generateQuestions(aiClient, {
        bookName: book.name,
        pages: pageRange,
        types: ['essay'],
      });
      for (const q of essayGenerated) {
        pendingQuestions.push({
          book_id: book.id,
          type: 'essay' as const,
          source_page: clampPage(q.sourcePage),
          prompt: q.prompt,
          choices: null,
          correct_answer: q.correctAnswer,
          used_reference: false,
        });
      }
    }
  }

  const { data: existingVocab, error: existingVocabError } = await (supabase.from('vocab_of_the_day') as any)
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (existingVocabError) throw new Error(`Failed to fetch vocab of the day: ${existingVocabError.message}`);

  let pendingVocab: Record<string, unknown> | null = null;
  if (!existingVocab) {
    const { data: pastVocab, error: pastVocabError } = await (supabase.from('vocab_of_the_day') as any).select('word_zh');
    if (pastVocabError) throw new Error(`Failed to fetch past vocab: ${pastVocabError.message}`);
    const vocab = await curateVocab(aiClient, (pastVocab ?? []).map((v: any) => v.word_zh));
    pendingVocab = {
      date: today,
      word_zh: vocab.wordZh,
      pinyin: vocab.pinyin,
      meaning_ko: vocab.meaningKo,
      example_zh: vocab.exampleZh,
      example_ko: vocab.exampleKo,
    };
  }

  // Nothing above threw: now it is safe to persist the session and its content.
  const { data: session, error: sessionError } = await (supabase.from('daily_sessions') as any)
    .insert({ date: today, essay_book_id: essayBook.id, completed: false })
    .select()
    .single();
  if (sessionError) throw new Error(`Failed to insert daily session: ${sessionError.message}`);
  if (!session) throw new Error('Daily session insert returned no row');

  if (pendingQuestions.length > 0) {
    const { error: questionsError } = await (supabase.from('questions') as any).insert(
      pendingQuestions.map((q) => ({ ...q, session_id: session.id }))
    );
    if (questionsError) throw new Error(`Failed to insert questions: ${questionsError.message}`);
  }

  if (pendingVocab) {
    const { error: vocabError } = await (supabase.from('vocab_of_the_day') as any).insert(
      pendingVocab
    );
    if (vocabError) throw new Error(`Failed to insert vocab of the day: ${vocabError.message}`);
  }

  return session;
}
