import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { calculateDailyRange } from '@/lib/pacing';
import { calculateWeights, pickWeightedTypes, type CategoryStat } from '@/lib/adaptive';
import { generateQuestions } from '@/lib/ai/generateQuestions';
import { curateVocab } from '@/lib/ai/curateVocab';

const QUESTIONS_PER_BOOK = 3;
const QUIZ_TYPES = ['grammar', 'vocab', 'reading', 'theory'] as const;

export async function assembleDailySession(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  today: string
) {
  const { data: existing } = await (supabase.from('daily_sessions') as any)
    .select('*')
    .eq('date', today)
    .maybeSingle();

  if (existing) return existing;

  const { data: books } = await (supabase.from('books') as any).select('*');
  if (!books || books.length === 0) throw new Error('No books found');

  const { data: statsRows } = await (supabase.from('category_stats') as any).select('*');
  const stats: CategoryStat[] = (statsRows ?? []).map((r: any) => ({
    type: r.type,
    correctCount: r.correct_count,
    totalCount: r.total_count,
  }));
  const weights = calculateWeights(stats);

  const dayIndex = Math.floor(new Date(today).getTime() / (1000 * 60 * 60 * 24));
  const essayBook = books[dayIndex % books.length];

  const { data: session } = await (supabase.from('daily_sessions') as any)
    .insert({ date: today, essay_book_id: essayBook.id, completed: false })
    .select()
    .single();

  for (const book of books) {
    const range = calculateDailyRange({
      totalPages: book.total_pages,
      examDate: book.exam_date,
      today,
      targetReadCount: book.target_read_count,
      currentReadCount: book.current_read_count,
      currentPage: book.current_page,
    });

    const { data: pages } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', book.id)
      .gte('page_num', range.startPage)
      .lte('page_num', range.endPage);

    const quizWeights = Object.fromEntries(
      QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
    ) as Record<(typeof QUIZ_TYPES)[number], number>;
    const types = pickWeightedTypes(quizWeights as any, QUESTIONS_PER_BOOK);

    let referenceExcerpts: string[] | undefined;
    if (types.includes('reading')) {
      const { data: refs } = await (supabase.from('reference_materials') as any)
        .select('content')
        .ilike('name', '%독해%')
        .limit(2);
      referenceExcerpts = (refs ?? []).map((r: any) => r.content);
    }

    const pageRange = (pages ?? []).map((p: any) => ({ pageNum: p.page_num, content: p.content }));

    const generated = await generateQuestions(aiClient, {
      bookName: book.name,
      pages: pageRange,
      types,
      referenceExcerpts,
    });

    const rows = generated.map((q) => ({
      book_id: book.id,
      session_id: session.id,
      type: q.type,
      source_page: q.sourcePage,
      prompt: q.prompt,
      choices: q.choices ?? null,
      correct_answer: q.correctAnswer,
      used_reference: !!referenceExcerpts,
    }));
    await (supabase.from('questions') as any).insert(rows);

    if (book.id === essayBook.id) {
      const essayGenerated = await generateQuestions(aiClient, {
        bookName: book.name,
        pages: pageRange,
        types: ['essay'],
      });
      const essayRows = essayGenerated.map((q) => ({
        book_id: book.id,
        session_id: session.id,
        type: 'essay' as const,
        source_page: q.sourcePage,
        prompt: q.prompt,
        choices: null,
        correct_answer: q.correctAnswer,
        used_reference: false,
      }));
      await (supabase.from('questions') as any).insert(essayRows);
    }
  }

  const { data: existingVocab } = await (supabase.from('vocab_of_the_day') as any)
    .select('*')
    .eq('date', today)
    .maybeSingle();

  if (!existingVocab) {
    const { data: pastVocab } = await (supabase.from('vocab_of_the_day') as any).select('word_zh');
    const vocab = await curateVocab(aiClient, (pastVocab ?? []).map((v: any) => v.word_zh));
    await (supabase.from('vocab_of_the_day') as any).insert({
      date: today,
      word_zh: vocab.wordZh,
      pinyin: vocab.pinyin,
      meaning_ko: vocab.meaningKo,
      example_zh: vocab.exampleZh,
      example_ko: vocab.exampleKo,
    });
  }

  return session;
}
