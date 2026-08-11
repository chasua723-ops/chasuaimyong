import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { calculateDailyRange } from '@/lib/pacing';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '@/lib/adaptive';
import { generateQuestions } from '@/lib/ai/generateQuestions';
import { generateFromRandomPage } from '@/lib/quiz/generateFromRandomPage';
import { curateVocab } from '@/lib/ai/curateVocab';

const AI_CONCURRENCY_LIMIT = 15;

/** Runs async tasks with at most `maxConcurrent` in flight at once. */
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function schedule() {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const run = queue.shift()!;
    run();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            schedule();
          });
      });
      schedule();
    });
  };
}

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

const QUESTIONS_PROGRESS_PER_BOOK = 5;
const QUESTIONS_REVIEW_PER_BOOK = 5;

export interface QuizGenerationRequest {
  type: QuestionType;
  minPage?: number;
  maxPage: number;
}

/** Fisher-Yates shuffle; takes an injectable rng so tests can assert a non-identity permutation deterministically. */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds the 10 per-book quiz generation requests: 5 bounded to today's newly assigned pages
 * (immediate reinforcement of what was just read) and 5 bounded to the whole textbook,
 * including pages not yet reached (broader retrieval practice). The two groups are shuffled
 * together so they render mixed, with no visible "오늘 진도" / "복습" split.
 */
export function buildQuizGenerationRequests(
  book: { total_pages: number },
  range: { startPage: number; endPage: number },
  quizWeights: Record<QuestionType, number>,
  rng: () => number = Math.random
): QuizGenerationRequest[] {
  const rangeWidth = Math.max(1, range.endPage - range.startPage + 1);
  const progressCount = Math.min(QUESTIONS_PROGRESS_PER_BOOK, rangeWidth);
  const reviewCount = QUESTIONS_PROGRESS_PER_BOOK + QUESTIONS_REVIEW_PER_BOOK - progressCount;

  const progressTypes = pickWeightedTypes(quizWeights, progressCount, rng);
  const reviewTypes = pickWeightedTypes(quizWeights, reviewCount, rng);

  const progressRequests: QuizGenerationRequest[] = progressTypes.map((type) => ({
    type,
    minPage: range.startPage,
    maxPage: Math.max(range.startPage, range.endPage),
  }));
  const reviewRequests: QuizGenerationRequest[] = reviewTypes.map((type) => ({
    type,
    maxPage: Math.max(1, book.total_pages),
  }));

  return shuffle([...progressRequests, ...reviewRequests], rng);
}

async function generateQuestionsForBook(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  book: any,
  essayBook: any,
  today: string,
  weights: Record<string, number>,
  limit: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<PendingQuestion[]> {
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
  const quizRequests = buildQuizGenerationRequests(book, range, quizWeights as any);

  // Up to 5 questions are bounded to today's newly assigned pages (immediate check on what was
  // just read); the rest are bounded to the whole textbook, including pages not yet reached,
  // for broader retrieval practice. The two groups are pre-shuffled by
  // buildQuizGenerationRequests so they render mixed together. Each question gets its own
  // independently random page, and all of a book's questions (plus its essay question, if any)
  // generate concurrently, subject to the shared `limit` concurrency cap.
  //
  // generateFromRandomPage already retries hard internally (6 single-page attempts + a
  // whole-range fallback) before giving up, so a single question failing here means that
  // specific content was unusually unlucky (e.g. Claude emitting invalid JSON on every
  // attempt) — not that anything is systemically broken. One such failure shouldn't cost the
  // other ~39 questions across the other books, so it's caught and dropped rather than
  // rejecting the whole Promise.all. assembleDailySession still refuses to persist a session
  // with zero total questions.
  const quizGenerations = quizRequests.map((req) =>
    limit(() =>
      generateFromRandomPage(supabase, aiClient, {
        bookId: book.id,
        bookName: book.name,
        minPage: req.minPage,
        maxPage: req.maxPage,
        type: req.type,
      })
    ).catch((err) => {
      console.error(`[assembleDailySession] quiz question generation failed for "${book.name}", skipping it:`, err);
      return null;
    })
  );

  // Mirrors the quiz path: generateEssayForBook already retries MAX_ESSAY_ATTEMPTS times
  // internally. If it still fails, skip today's essay rather than failing the whole session.
  const essayGeneration =
    book.id === essayBook.id
      ? generateEssayForBook(supabase, aiClient, book, range).catch((err) => {
          console.error(`[assembleDailySession] essay generation failed for "${book.name}", skipping it:`, err);
          return [];
        })
      : Promise.resolve([]);

  const [quizResults, essayQuestions] = await Promise.all([
    Promise.all(quizGenerations),
    essayGeneration,
  ]);

  const pendingQuestions: PendingQuestion[] = quizResults
    .filter((generated): generated is NonNullable<typeof generated> => generated !== null)
    .map((generated) => ({
      book_id: book.id,
      type: generated.type,
      source_page: generated.sourcePage,
      prompt: generated.prompt,
      choices: generated.choices ?? null,
      correct_answer: generated.correctAnswer,
      used_reference: generated.usedReference,
    }));

  return [...pendingQuestions, ...essayQuestions];
}

const MAX_ESSAY_ATTEMPTS = 3;

async function generateEssayForBook(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  book: any,
  range: { startPage: number; endPage: number }
): Promise<PendingQuestion[]> {
  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('page_num, content')
    .eq('book_id', book.id)
    .gte('page_num', range.startPage)
    .lte('page_num', range.endPage);
  if (pagesError) throw new Error(`Failed to fetch book pages: ${pagesError.message}`);
  const pageRange = (pages ?? []).map((p: any) => ({ pageNum: p.page_num, content: p.content }));

  // Claude sometimes returns a sourcePage outside the excerpt it was given. Persisting that
  // would break the later book_pages lookup in recordEssayAttempt, silently degrading the
  // RAG grounding to an empty page while the UI still claims "(N페이지 참고)".
  const clampPage = (page: number) =>
    Math.min(Math.max(Number(page) || range.startPage, range.startPage), range.endPage);

  // Unlike the quiz path (generateFromRandomPage), there's only one essay question per day,
  // with no built-in retry — a single bad response (e.g. Claude emitting an unescaped quote
  // inside a JSON string, which fails parseJsonResponse) used to throw immediately and take
  // down the whole day's session, including every other book's already-successful questions.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ESSAY_ATTEMPTS; attempt++) {
    try {
      const essayGenerated = await generateQuestions(aiClient, {
        bookName: book.name,
        pages: pageRange,
        types: ['essay'],
      });

      return essayGenerated.map((q) => ({
        book_id: book.id,
        type: 'essay' as const,
        source_page: clampPage(q.sourcePage),
        prompt: q.prompt,
        choices: null,
        correct_answer: q.correctAnswer,
        used_reference: false,
      }));
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to generate essay question');
}

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

  // Everything that can throw happens BEFORE the daily_sessions insert, so a failure leaves
  // no session row behind and the next request retries from scratch instead of returning a
  // dead session. Individual question/essay/vocab failures are caught and skipped rather than
  // aborting everything (see the per-book generation below and the zero-questions guard after
  // it) — only a total wipeout (nothing generated at all) still throws here.
  //
  // Each book's generation work (its quiz questions plus, for one book, the essay
  // question) runs concurrently — both across books and within a book — instead of
  // sequentially, but capped at AI_CONCURRENCY_LIMIT in-flight calls at once (shared across
  // all books) so a day with several books and up to 10 quiz questions each doesn't burst
  // past what the 60s serverless budget or Anthropic's rate limits can absorb.
  const limit = createLimiter(AI_CONCURRENCY_LIMIT);
  const pendingQuestionsByBook = await Promise.all(
    books.map((book: any) => generateQuestionsForBook(supabase, aiClient, book, essayBook, today, weights, limit))
  );
  const pendingQuestions: PendingQuestion[] = pendingQuestionsByBook.flat();

  // Individual question failures are already tolerated above; this is the floor — if literally
  // nothing could be generated (every book, every question), that's not bad luck on one piece
  // of content, it's a systemic problem, and there'd be nothing for the user to study anyway.
  // Refuse to persist an empty session so the next request retries from scratch.
  if (pendingQuestions.length === 0) {
    throw new Error('All question generation failed; no questions available for today');
  }

  const { data: existingVocab, error: existingVocabError } = await (supabase.from('vocab_of_the_day') as any)
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (existingVocabError) throw new Error(`Failed to fetch vocab of the day: ${existingVocabError.message}`);

  // A missing vocab card is a minor cosmetic gap, not a reason to block the whole session.
  let pendingVocab: Record<string, unknown> | null = null;
  if (!existingVocab) {
    const { data: pastVocab, error: pastVocabError } = await (supabase.from('vocab_of_the_day') as any).select('word_zh');
    if (pastVocabError) throw new Error(`Failed to fetch past vocab: ${pastVocabError.message}`);
    try {
      const vocab = await curateVocab(aiClient, (pastVocab ?? []).map((v: any) => v.word_zh));
      pendingVocab = {
        date: today,
        word_zh: vocab.wordZh,
        pinyin: vocab.pinyin,
        meaning_ko: vocab.meaningKo,
        example_zh: vocab.exampleZh,
        example_ko: vocab.exampleKo,
      };
    } catch (err) {
      console.error('[assembleDailySession] vocab curation failed, skipping today\'s vocab card:', err);
    }
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
