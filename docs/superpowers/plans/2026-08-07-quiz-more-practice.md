# 오늘의 학습 더 풀기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user request additional quiz practice questions per book, on demand, sourced from
the book's full covered range instead of just today's assigned slice — plus a "더 풀기 기록" binder
tab for reviewing every on-demand attempt.

**Architecture:** `QUIZ_TYPES` moves from `assembleDailySession.ts` into `src/lib/adaptive.ts` as a
shared constant. A new `src/lib/quiz/` module pairs a pure generation function
(`generateQuizPractice`, weighted-random type + full-range random page, mirroring
`generateEssayPractice`) and a notes function (`getQuizPracticeNotes`, mirroring `getEssayNotes`)
with one thin API route each. `BookSection` gains a `bookId` prop and becomes self-contained for
this feature — it owns its own practice-question and feedback state, posting to the existing
`POST /api/attempts` endpoint for submission (already session-agnostic, verified in
`recordAttempt.ts`). A new `/quiz-practice` page and third `CoverScreen` tab expose the record.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, CSS Modules, Vitest + Testing Library —
same stack as the rest of the app, no new dependencies.

## Global Constraints

- No new npm dependencies.
- No new migration — `questions.session_id` is already nullable
  (`supabase/migrations/0002_essay_concept_grading.sql`), and `attempts`/`category_stats` writes are
  already session-agnostic.
- All user-facing text is Korean; Chinese text rendered anywhere in the UI must use the `zh` global
  CSS class (backed by Noto Sans SC).
- Follow the existing CSS Modules pattern: shared question/session-card styles live in
  `src/app/components/session.module.css`; a new page gets its own co-located `*.module.css`.
- This codebase does not unit-test API route handlers directly — routes stay thin and are exercised
  through component/page-level tests that mock `fetch`. Do not add `route.test.ts` files.
- Match the mock-Supabase test convention used throughout (`tests/helpers/mockSupabase.ts`,
  `createMockSupabase`).

---

### Task 1: Shared `QUIZ_TYPES` + `generateQuizPractice` + route

**Files:**
- Modify: `src/lib/adaptive.ts`
- Modify: `src/lib/adaptive.test.ts`
- Modify: `src/lib/session/assembleDailySession.ts`
- Create: `src/lib/quiz/generateQuizPractice.ts`
- Test: `src/lib/quiz/generateQuizPractice.test.ts`
- Create: `src/app/api/quiz-practice/new/route.ts`

**Interfaces:**
- Consumes: `calculateWeights`, `pickWeightedTypes` from `./adaptive` (unchanged behavior, just a
  new exported constant alongside them); `generateQuestions` from `../ai/generateQuestions`.
- Produces (used by Task 2):
  ```ts
  export interface GenerateQuizPracticeInput {
    bookId: string;
  }
  export interface QuizPracticeQuestion {
    id: string;
    type: QuestionType;
    prompt: string;
    choices: string[] | null;
    sourcePage: number;
  }
  export async function generateQuizPractice(
    supabase: SupabaseClient,
    aiClient: Anthropic,
    input: GenerateQuizPracticeInput
  ): Promise<QuizPracticeQuestion>
  ```
  `POST /api/quiz-practice/new` → body `{ bookId: string }` → `200 QuizPracticeQuestion` on success,
  `500 { error: string }` on failure.

- [x] **Step 1: Write the failing test for the shared `QUIZ_TYPES` export**

`src/lib/adaptive.test.ts` has two top-level `describe` blocks (`calculateWeights` and
`pickWeightedTypes`). Add a third one at the end of the file:

```ts
describe('QUIZ_TYPES', () => {
  it('exports the four quiz question types in a fixed order', () => {
    expect(QUIZ_TYPES).toEqual(['grammar', 'vocab', 'reading', 'theory']);
  });
});
```

Add `QUIZ_TYPES` to the existing import line at the top of the test file:
`import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from './adaptive';`

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- adaptive`
Expected: FAIL — `QUIZ_TYPES` is not exported from `./adaptive` yet.

- [x] **Step 3: Export `QUIZ_TYPES` from `adaptive.ts` and use it in `assembleDailySession.ts`**

In `src/lib/adaptive.ts`, add near the top (after the `CategoryStat` interface):

```ts
export const QUIZ_TYPES = ['grammar', 'vocab', 'reading', 'theory'] as const;
```

In `src/lib/session/assembleDailySession.ts`, remove the local
`const QUIZ_TYPES = ['grammar', 'vocab', 'reading', 'theory'] as const;` and instead import it:

```ts
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '@/lib/adaptive';
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- adaptive assembleDailySession`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/adaptive.ts src/lib/adaptive.test.ts src/lib/session/assembleDailySession.ts
git commit -m "refactor: export QUIZ_TYPES from adaptive.ts for reuse"
```

- [x] **Step 6: Write the failing tests for `generateQuizPractice`**

Create `src/lib/quiz/generateQuizPractice.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateQuizPractice } from './generateQuizPractice';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { generateQuestions } from '../ai/generateQuestions';

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn().mockResolvedValue([
    { type: 'grammar', sourcePage: 5, prompt: '다음 중 옳은 것은?', choices: ['A', 'B'], correctAnswer: 'A' },
  ]),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', current_page: 10 }],
    book_pages: [
      { book_id: 'b1', page_num: 1, content: '내용1' },
      { book_id: 'b1', page_num: 5, content: '내용5' },
      { book_id: 'b1', page_num: 10, content: '내용10' },
    ],
    category_stats: [],
    reference_materials: [],
    questions: [],
    ...overrides,
  };
}

describe('generateQuizPractice', () => {
  it('generates a new quiz question from a page within the read range and stores it with no session', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('다음 중 옳은 것은?');
    expect(result.choices).toEqual(['A', 'B']);
    expect(supabase.inserted.questions[0]).toMatchObject({
      book_id: 'b1',
      session_id: null,
    });
    randomSpy.mockRestore();
  });

  it('picks a type from QUIZ_TYPES via the adaptive weights', async () => {
    // Only 3 of 10 pages in baseTables() have book_pages rows, so leaving Math.random
    // unmocked here would make the 2-attempt page-retry loop flaky (~49% chance both
    // attempts miss). Force both draws onto page 5, which exists.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(['grammar', 'vocab', 'reading', 'theory']).toContain(result.type);
    randomSpy.mockRestore();
  });

  it('retries with a different page when the first random page has no content, then succeeds', async () => {
    // generateQuizPractice draws Math.random in this order: (1) type pick via
    // pickWeightedTypes, (2) page pick per attempt. category_stats is [] here so all four
    // types carry the default 0.5 weight — the exact type picked doesn't matter for this test,
    // only that the mock sequence accounts for that first draw before the page draws.
    const supabase = createMockSupabase(
      baseTables({ book_pages: [{ book_id: 'b1', page_num: 10, content: '내용10' }] })
    );
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.9); // type pick (uniform weights, any value works)
    randomSpy.mockReturnValueOnce(0.05); // -> page 1, missing from book_pages
    randomSpy.mockReturnValueOnce(0.95); // -> page 10, present

    const result = await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('다음 중 옳은 것은?');
    randomSpy.mockRestore();
  });

  it('fetches reference excerpts when the picked type is reading', async () => {
    vi.mocked(generateQuestions).mockResolvedValueOnce([
      { type: 'reading', sourcePage: 5, prompt: '독해 문제', correctAnswer: '정답' },
    ]);
    const supabase = createMockSupabase(
      baseTables({
        category_stats: [
          { type: 'grammar', correct_count: 10, total_count: 10 },
          { type: 'vocab', correct_count: 10, total_count: 10 },
          { type: 'theory', correct_count: 10, total_count: 10 },
          { type: 'reading', correct_count: 0, total_count: 10 },
        ],
        reference_materials: [{ name: '독해 기출', content: '기출 내용' }],
      })
    );
    // With those stats: grammar/vocab/theory each get the 0.1 floor weight, reading gets 1.0
    // (entries iterate in QUIZ_TYPES order — grammar, vocab, reading, theory; totalWeight 1.3).
    // rng()=0.5 -> r=0.65, which lands past grammar+vocab (0.2) and within reading's span
    // (0.2, 1.2] -> deterministically picks reading. Second draw (0.4) picks page 5, which
    // exists in baseTables()'s default book_pages, so no retry is needed.
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.5); // type pick -> reading
    randomSpy.mockReturnValueOnce(0.4); // page pick -> page 5 (exists)

    await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    // .at(-1), not [0]: this file's other `it` blocks already called the mocked
    // generateQuestions earlier and vitest doesn't clear mock call history between tests here.
    const lastCall = vi.mocked(generateQuestions).mock.calls.at(-1)!;
    expect(lastCall[1].referenceExcerpts).toEqual(['기출 내용']);
    randomSpy.mockRestore();
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      generateQuizPractice(supabase as any, {} as any, { bookId: 'missing' })
    ).rejects.toThrow('Book not found');
  });
});
```

- [x] **Step 7: Run the tests to verify they fail**

Run: `npm test -- generateQuizPractice`
Expected: FAIL with "Cannot find module './generateQuizPractice'".

- [x] **Step 8: Implement `generateQuizPractice.ts`**

Create `src/lib/quiz/generateQuizPractice.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '../adaptive';
import { generateQuestions } from '../ai/generateQuestions';

export interface GenerateQuizPracticeInput {
  bookId: string;
}

export interface QuizPracticeQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

function randomPage(maxPage: number): number {
  return Math.floor(Math.random() * maxPage) + 1;
}

export async function generateQuizPractice(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateQuizPracticeInput
): Promise<QuizPracticeQuestion> {
  const { data: book } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', input.bookId)
    .single();
  if (!book) throw new Error('Book not found');

  const { data: statsRows } = await (supabase.from('category_stats') as any).select('*');
  const stats: CategoryStat[] = (statsRows ?? []).map((r: any) => ({
    type: r.type,
    correctCount: r.correct_count,
    totalCount: r.total_count,
  }));
  const weights = calculateWeights(stats);
  const quizWeights = Object.fromEntries(
    QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
  ) as Record<(typeof QUIZ_TYPES)[number], number>;
  const [type] = pickWeightedTypes(quizWeights as any, 1);

  const maxPage = Math.max(1, book.current_page);

  let page: { page_num: number; content: string } | null = null;
  for (let attempt = 0; attempt < 2 && !page; attempt++) {
    const pageNum = randomPage(maxPage);
    const { data } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', input.bookId)
      .eq('page_num', pageNum)
      .maybeSingle();
    page = data;
  }
  if (!page) throw new Error('No page content found for quiz practice');

  let referenceExcerpts: string[] | undefined;
  if (type === 'reading') {
    const { data: refs } = await (supabase.from('reference_materials') as any)
      .select('content')
      .ilike('name', '%독해%')
      .limit(2);
    referenceExcerpts = (refs ?? []).map((r: any) => r.content);
  }

  const [generated] = await generateQuestions(aiClient, {
    bookName: book.name,
    pages: [{ pageNum: page.page_num, content: page.content }],
    types: [type],
    referenceExcerpts,
  });

  const { data: inserted, error } = await (supabase.from('questions') as any)
    .insert({
      book_id: input.bookId,
      session_id: null,
      type: generated.type,
      source_page: generated.sourcePage,
      prompt: generated.prompt,
      choices: generated.choices ?? null,
      correct_answer: generated.correctAnswer,
      used_reference: !!referenceExcerpts?.length,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to insert quiz practice question: ${error.message}`);

  return {
    id: inserted.id,
    type: inserted.type,
    prompt: inserted.prompt,
    choices: inserted.choices ?? null,
    sourcePage: inserted.source_page,
  };
}
```

- [x] **Step 9: Run the tests to verify they pass**

Run: `npm test -- generateQuizPractice`
Expected: PASS (5/5).

- [x] **Step 10: Implement the route**

Create `src/app/api/quiz-practice/new/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { generateQuizPractice } from '@/lib/quiz/generateQuizPractice';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { bookId: string };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const question = await generateQuizPractice(supabase, getAnthropicClient(), body);
    return NextResponse.json(question);
  } catch (err) {
    console.error('[POST /api/quiz-practice/new] failed:', err);
    return NextResponse.json({ error: '새 문제를 만들지 못했어요' }, { status: 500 });
  }
}
```

- [x] **Step 11: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 12: Commit**

```bash
git add src/lib/quiz/generateQuizPractice.ts src/lib/quiz/generateQuizPractice.test.ts src/app/api/quiz-practice/new/route.ts
git commit -m "feat: generate on-demand quiz practice questions from a book's full read range"
```

---

### Task 2: "더 풀기" button and inline practice flow on `BookSection`

**Files:**
- Modify: `src/app/components/BookSection.tsx`
- Modify: `src/app/components/BookSection.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/components/session.module.css`

**Interfaces:**
- Consumes: `POST /api/quiz-practice/new` (Task 1), `POST /api/attempts` (existing, unchanged), the
  existing `QuizQuestion` component.
- Produces: no new exports — `BookSection` gains a required `bookId: string` prop.

- [x] **Step 1: Write the failing tests**

Update the top of `src/app/components/BookSection.test.tsx` to add `bookId="b1"` to every existing
`render(<BookSection ... />)` call (all four `it` blocks) — the prop is now required. Then add:

```tsx
  it('always shows a "더 풀기" button, even before finishing the daily questions', () => {
    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={quizQuestions}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('더 풀기')).toBeInTheDocument();
  });

  it('generates and renders a new practice question when "더 풀기" is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p1', type: 'grammar', prompt: '연습 문제', choices: ['X', 'Y'], sourcePage: 7 }),
    }) as any;

    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('더 풀기'));

    expect(await screen.findByText(/연습 문제/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/quiz-practice/new',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ bookId: 'b1' }) })
    );
  });

  it('submits a practice answer to /api/attempts and shows feedback', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'p1', type: 'grammar', prompt: '연습 문제', choices: ['X', 'Y'], sourcePage: 7 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isCorrect: true }),
      }) as any;

    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('더 풀기'));
    await screen.findByText(/연습 문제/);
    await user.click(screen.getByText('X'));

    expect(await screen.findByText('정답입니다')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/attempts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ questionId: 'p1', userAnswer: 'X' }),
      })
    );
  });
```

Add `userEvent` and `vi` imports if not already present (this file already imports `vi` from
vitest; add `import userEvent from '@testing-library/user-event';` next to the existing
`@testing-library/react` import).

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- BookSection`
Expected: FAIL — `bookId` prop missing (TS error) and "더 풀기" not found.

- [x] **Step 3: Add the "더 풀기" styles**

In `src/app/components/session.module.css`, append after `.overcomeMeta`:

```css
.morePracticeButton {
  background: var(--quiz-practice-accent);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  margin-bottom: 12px;
}

.morePracticeLoading {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.morePracticeError {
  font-size: 12px;
  color: #d64545;
  margin-bottom: 12px;
}
```

(`--quiz-practice-accent` is added to `globals.css` in Task 4; if that task hasn't landed yet in
your working tree, add the token now — see Task 4 Step 3 for the exact values.)

- [x] **Step 4: Update `BookSection.tsx`**

Replace the full contents of `src/app/components/BookSection.tsx`:

```tsx
// src/app/components/BookSection.tsx
'use client';

import { useState } from 'react';
import type { Question, QuizFeedback, EssayFeedback } from './types';
import QuizQuestion from './QuizQuestion';
import EssayQuestion from './EssayQuestion';
import styles from './session.module.css';

const BOOK_ICONS: Record<string, string> = {
  문법: '📘',
  문학개론: '📖',
  어학개론: '🗣️',
};

function getBookIcon(name: string): string {
  return BOOK_ICONS[name] ?? '📕';
}

interface PracticeQuestion {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

interface BookSectionProps {
  bookId: string;
  name: string;
  startPage: number;
  endPage: number;
  quizQuestions: Question[];
  essayQuestion: Question | undefined;
  quizFeedback: Record<string, QuizFeedback>;
  onSubmitQuiz: (questionId: string, answer: string) => void;
  koreanDraft: string;
  chineseAnswer: string;
  essayFeedback: EssayFeedback | undefined;
  onKoreanChange: (value: string) => void;
  onChineseChange: (value: string) => void;
  onSubmitEssay: () => void;
}

export default function BookSection({
  bookId,
  name,
  startPage,
  endPage,
  quizQuestions,
  essayQuestion,
  quizFeedback,
  onSubmitQuiz,
  koreanDraft,
  chineseAnswer,
  essayFeedback,
  onKoreanChange,
  onChineseChange,
  onSubmitEssay,
}: BookSectionProps) {
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [practiceFeedback, setPracticeFeedback] = useState<Record<string, QuizFeedback>>({});
  const [generating, setGenerating] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  async function requestMorePractice() {
    setGenerating(true);
    setPracticeError(null);
    try {
      const res = await fetch('/api/quiz-practice/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        setPracticeError('새 문제를 만들지 못했어요. 다시 시도해주세요.');
        return;
      }
      const question = (await res.json()) as PracticeQuestion;
      setPracticeQuestions((prev) => [...prev, question]);
    } finally {
      setGenerating(false);
    }
  }

  async function submitPracticeAnswer(questionId: string, answer: string) {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, userAnswer: answer }),
    });
    const result = await res.json();
    setPracticeFeedback((prev) => ({
      ...prev,
      [questionId]: result.isCorrect
        ? 'correct'
        : { explanation: result.explanation, sourcePage: result.sourcePage },
    }));
  }

  return (
    <section className={styles.bookSection}>
      <div className={styles.bookHeader}>
        <span className={styles.bookIcon}>{getBookIcon(name)}</span>
        <strong className={styles.bookName}>{name}</strong>
        <span className={styles.bookRangeBadge}>
          {startPage}~{endPage}p
        </span>
      </div>

      {quizQuestions.map((q, i) => (
        <QuizQuestion key={q.id} question={q} index={i + 1} feedback={quizFeedback[q.id]} onSubmit={onSubmitQuiz} />
      ))}

      {practiceQuestions.map((q, i) => (
        <QuizQuestion
          key={q.id}
          question={{ id: q.id, book_id: bookId, type: q.type, prompt: q.prompt, choices: q.choices, source_page: q.sourcePage }}
          index={quizQuestions.length + i + 1}
          feedback={practiceFeedback[q.id]}
          onSubmit={submitPracticeAnswer}
        />
      ))}

      <button className={styles.morePracticeButton} onClick={requestMorePractice} disabled={generating}>
        더 풀기
      </button>
      {generating && <p className={styles.morePracticeLoading}>문제 만드는 중...</p>}
      {practiceError && <p className={styles.morePracticeError}>{practiceError}</p>}

      {essayQuestion && (
        <EssayQuestion
          question={essayQuestion}
          koreanDraft={koreanDraft}
          chineseAnswer={chineseAnswer}
          feedback={essayFeedback}
          onKoreanChange={onKoreanChange}
          onChineseChange={onChineseChange}
          onSubmit={onSubmitEssay}
        />
      )}
    </section>
  );
}
```

- [x] **Step 5: Pass `bookId` from `page.tsx`**

In `src/app/page.tsx`, add `bookId={range.bookId}` to the `<BookSection ... />` call (it currently
starts with `key={range.bookId}` — add `bookId={range.bookId}` right after it).

- [x] **Step 6: Run the tests to verify they pass**

Run: `npm test -- BookSection page`
Expected: PASS.

- [x] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all green.

- [x] **Step 8: Commit**

```bash
git add src/app/components/BookSection.tsx src/app/components/BookSection.test.tsx src/app/page.tsx src/app/components/session.module.css
git commit -m "feat: add inline '더 풀기' practice flow to each book section"
```

---

### Task 3: `getQuizPracticeNotes` + list route

**Files:**
- Create: `src/lib/quiz/getQuizPracticeNotes.ts`
- Test: `src/lib/quiz/getQuizPracticeNotes.test.ts`
- Create: `src/app/api/quiz-practice/route.ts`

**Interfaces:**
- Consumes: `QuestionType` from `@/types/db`.
- Produces (used by Task 5):
  ```ts
  export interface QuizPracticeNote {
    id: string;
    bookName: string;
    type: QuestionType;
    prompt: string;
    choices: string[] | null;
    userAnswer: string;
    isCorrect: boolean;
    sourcePage: number;
    createdAt: string;
  }
  export async function getQuizPracticeNotes(supabase: SupabaseClient): Promise<QuizPracticeNote[]>
  ```
  `GET /api/quiz-practice` → `200 { notes: QuizPracticeNote[] }` on success,
  `500 { error: string }` on failure.

- [x] **Step 1: Write the failing tests**

Create `src/lib/quiz/getQuizPracticeNotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getQuizPracticeNotes } from './getQuizPracticeNotes';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

describe('getQuizPracticeNotes', () => {
  it('includes only questions with no session (on-demand practice), excluding essay', async () => {
    const supabase = createMockSupabase({
      questions: [
        { id: 'q1', book_id: 'b1', session_id: null, type: 'grammar', prompt: '연습1', choices: ['A'], source_page: 3, created_at: '2026-08-01' },
        { id: 'q2', book_id: 'b1', session_id: 's1', type: 'grammar', prompt: '일일문제', choices: ['A'], source_page: 4, created_at: '2026-08-01' },
        { id: 'q3', book_id: 'b1', session_id: null, type: 'essay', prompt: '서술형', choices: null, source_page: 5, created_at: '2026-08-01' },
      ],
      attempts: [
        { id: 'a1', question_id: 'q1', user_answer: 'A', is_correct: true, created_at: '2026-08-01T10:00:00Z' },
        { id: 'a2', question_id: 'q2', user_answer: 'A', is_correct: true, created_at: '2026-08-01T10:00:00Z' },
        { id: 'a3', question_id: 'q3', user_answer: null, is_correct: null, created_at: '2026-08-01T10:00:00Z' },
      ],
      books: [{ id: 'b1', name: '전공중국어 문법' }],
    });

    const notes = await getQuizPracticeNotes(supabase as any);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: 'a1', bookName: '전공중국어 문법', prompt: '연습1', isCorrect: true });
  });

  it('produces one row per attempt, newest first, when a question was retried', async () => {
    const supabase = createMockSupabase({
      questions: [
        { id: 'q1', book_id: 'b1', session_id: null, type: 'grammar', prompt: '연습1', choices: ['A', 'B'], source_page: 3, created_at: '2026-08-01' },
      ],
      attempts: [
        { id: 'a1', question_id: 'q1', user_answer: 'B', is_correct: false, created_at: '2026-08-01T10:00:00Z' },
        { id: 'a2', question_id: 'q1', user_answer: 'A', is_correct: true, created_at: '2026-08-01T10:05:00Z' },
      ],
      books: [{ id: 'b1', name: '전공중국어 문법' }],
    });

    const notes = await getQuizPracticeNotes(supabase as any);

    expect(notes.map((n) => n.id)).toEqual(['a2', 'a1']);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- getQuizPracticeNotes`
Expected: FAIL with "Cannot find module './getQuizPracticeNotes'".

- [x] **Step 3: Implement `getQuizPracticeNotes.ts`**

Create `src/lib/quiz/getQuizPracticeNotes.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestionType } from '@/types/db';

export interface QuizPracticeNote {
  id: string;
  bookName: string;
  type: QuestionType;
  prompt: string;
  choices: string[] | null;
  userAnswer: string;
  isCorrect: boolean;
  sourcePage: number;
  createdAt: string;
}

export async function getQuizPracticeNotes(supabase: SupabaseClient): Promise<QuizPracticeNote[]> {
  const { data: attempts } = await (supabase.from('attempts') as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  const { data: questions } = await (supabase.from('questions') as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  const { data: books } = await (supabase.from('books') as any).select('*');

  const questionById = new Map<string, any>((questions ?? []).map((q: any) => [q.id, q]));
  const bookNameById = new Map<string, string>((books ?? []).map((b: any) => [b.id, b.name]));

  const notes: QuizPracticeNote[] = [];
  for (const attempt of attempts ?? []) {
    const question = questionById.get(attempt.question_id);
    if (!question) continue;
    if (question.session_id !== null || question.type === 'essay') continue;

    notes.push({
      id: attempt.id,
      bookName: bookNameById.get(question.book_id) ?? '',
      type: question.type,
      prompt: question.prompt,
      choices: question.choices ?? null,
      userAnswer: attempt.user_answer ?? '',
      isCorrect: !!attempt.is_correct,
      sourcePage: question.source_page,
      createdAt: attempt.created_at,
    });
  }

  notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return notes;
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- getQuizPracticeNotes`
Expected: PASS (2/2).

- [x] **Step 5: Implement the route**

Create `src/app/api/quiz-practice/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQuizPracticeNotes } from '@/lib/quiz/getQuizPracticeNotes';

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const notes = await getQuizPracticeNotes(supabase);
    return NextResponse.json({ notes });
  } catch (err) {
    console.error('[GET /api/quiz-practice] failed:', err);
    return NextResponse.json({ error: '더 풀기 기록을 불러오지 못했어요' }, { status: 500 });
  }
}
```

- [x] **Step 6: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add src/lib/quiz/getQuizPracticeNotes.ts src/lib/quiz/getQuizPracticeNotes.test.ts src/app/api/quiz-practice/route.ts
git commit -m "feat: add GET /api/quiz-practice listing all on-demand practice attempts"
```

---

### Task 4: "더 풀기 기록" tab on `CoverScreen`

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/components/session.module.css`
- Modify: `src/app/components/CoverScreen.tsx`
- Modify: `src/app/components/CoverScreen.test.tsx`

**Interfaces:**
- Consumes: `next/link`'s `Link` (already used by the existing two tabs).
- Produces: no new exports — a third tab added to `CoverScreen`, linking to `/quiz-practice`.

- [x] **Step 1: Write the failing test**

Add to `src/app/components/CoverScreen.test.tsx` (after the "서술형 노트" tab test):

```tsx
  it('links to the quiz practice record via a third binder tab', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText('더 풀기 기록').closest('a');
    expect(link).toHaveAttribute('href', '/quiz-practice');
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- CoverScreen`
Expected: FAIL — no element with text "더 풀기 기록" exists yet.

- [x] **Step 3: Add the blue accent tokens**

In `src/app/globals.css`, add inside the existing `:root { ... }` block, after
`--essay-notes-accent-text`:

```css
  --quiz-practice-accent: #3b73b9;
  --quiz-practice-accent-bg: #e8f0fa;
  --quiz-practice-accent-text: #1f4d80;
```

- [x] **Step 4: Fix `.essayNotesTab`'s corner and add `.quizPracticeTab`**

In `src/app/components/session.module.css`, `.essayNotesTab` is currently the last tab and has
`border-radius: 0 0 8px 0;`. It's no longer last — change that line to `border-radius: 0;`. Then add
a third rule right after `.essayNotesTab`:

```css
.quizPracticeTab {
  display: block;
  box-sizing: content-box;
  background: var(--quiz-practice-accent);
  color: #ffffff;
  border-radius: 0 0 8px 0;
  padding: 14px 6px;
  font-size: 12px;
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  white-space: nowrap;
}
```

- [x] **Step 5: Add the `Link` to `CoverScreen`**

In `src/app/components/CoverScreen.tsx`, add a third `Link` right after the existing 서술형 노트
one:

```tsx
      <Link href="/notebook" className={styles.notebookTab}>
        오답노트
      </Link>
      <Link href="/essay-notes" className={styles.essayNotesTab}>
        서술형 노트
      </Link>
      <Link href="/quiz-practice" className={styles.quizPracticeTab}>
        더 풀기 기록
      </Link>
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npm test -- CoverScreen`
Expected: PASS (5/5).

- [x] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/components/session.module.css src/app/components/CoverScreen.tsx src/app/components/CoverScreen.test.tsx
git commit -m "feat: add quiz-practice-record binder tab to the cover screen"
```

---

### Task 5: `/quiz-practice` page

**Files:**
- Create: `src/app/quiz-practice/quiz-practice.module.css`
- Create: `src/app/quiz-practice/page.tsx`
- Test: `src/app/quiz-practice/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/quiz-practice` (Task 3).
- Produces: the `/quiz-practice` route, linked from `CoverScreen` (Task 4).

- [x] **Step 1: Write the failing tests**

Create `src/app/quiz-practice/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuizPracticePage from './page';

describe('QuizPracticePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders the notes list', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        notes: [
          {
            id: 'a1',
            bookName: '전공중국어 문법',
            type: 'grammar',
            prompt: '연습 문제',
            choices: ['A', 'B'],
            userAnswer: 'A',
            isCorrect: true,
            sourcePage: 3,
            createdAt: '2026-08-07T10:00:00Z',
          },
        ],
      }),
    });

    render(<QuizPracticePage />);

    expect(await screen.findByText('연습 문제')).toBeInTheDocument();
    expect(screen.getByText('전공중국어 문법')).toBeInTheDocument();
    expect(screen.getByText('문법')).toBeInTheDocument();
  });

  it('shows an empty state when there are no notes', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ notes: [] }) });

    render(<QuizPracticePage />);

    expect(await screen.findByText('아직 더 풀기로 만든 문제가 없어요.')).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network error'));

    render(<QuizPracticePage />);

    expect(await screen.findByText('더 풀기 기록을 불러오지 못했어요. 새로고침 해주세요.')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- quiz-practice/page`
Expected: FAIL with "Cannot find module './page'".

- [x] **Step 3: Create the page styles**

Create `src/app/quiz-practice/quiz-practice.module.css`:

```css
.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  margin-top: 20px;
}

.noteCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}

.noteMeta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.noteBook {
  font-size: 11px;
  color: var(--text-secondary);
}

.noteType {
  font-size: 10px;
  font-weight: 600;
  color: var(--quiz-practice-accent-text);
  background: var(--quiz-practice-accent-bg);
  padding: 2px 8px;
  border-radius: 999px;
}

.notePrompt {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.noteAnswer {
  font-size: 12px;
  color: var(--text-secondary);
}

.noteCorrect {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}

.noteWrong {
  font-size: 11px;
  font-weight: 700;
  color: #d64545;
}
```

- [x] **Step 4: Implement the page**

Create `src/app/quiz-practice/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { containsChinese } from '@/lib/containsChinese';
import styles from './quiz-practice.module.css';

const TYPE_LABELS: Record<string, string> = {
  grammar: '문법',
  vocab: '어휘',
  reading: '독해',
  theory: '이론',
};

interface QuizPracticeNote {
  id: string;
  bookName: string;
  type: string;
  prompt: string;
  userAnswer: string;
  isCorrect: boolean;
  sourcePage: number;
}

export default function QuizPracticePage() {
  const [notes, setNotes] = useState<QuizPracticeNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/quiz-practice');
        if (!res.ok) throw new Error(`quiz practice request failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setNotes(json.notes);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('더 풀기 기록을 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className={styles.page}>{error}</p>;
  if (!notes) return <p className={styles.page}>불러오는 중...</p>;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>더 풀기 기록</h1>

      {notes.length === 0 && <p className={styles.empty}>아직 더 풀기로 만든 문제가 없어요.</p>}
      {notes.map((note) => (
        <div key={note.id} className={styles.noteCard}>
          <div className={styles.noteMeta}>
            <span className={styles.noteBook}>{note.bookName}</span>
            <span className={styles.noteType}>{TYPE_LABELS[note.type] ?? note.type}</span>
          </div>
          <p className={`${styles.notePrompt}${containsChinese(note.prompt) ? ' zh' : ''}`}>{note.prompt}</p>
          <p className={styles.noteAnswer}>내 답: {note.userAnswer}</p>
          <p className={note.isCorrect ? styles.noteCorrect : styles.noteWrong}>
            {note.isCorrect ? '정답' : '오답'} · {note.sourcePage}페이지 참고
          </p>
        </div>
      ))}
    </main>
  );
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test -- quiz-practice/page`
Expected: PASS (3/3).

- [x] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all green.

- [x] **Step 7: Commit**

```bash
git add src/app/quiz-practice/quiz-practice.module.css src/app/quiz-practice/page.tsx src/app/quiz-practice/page.test.tsx
git commit -m "feat: add /quiz-practice page for reviewing on-demand quiz attempts"
```

---

## Manual verification (after all tasks land)

- Start the app, open a book section, click "더 풀기" before answering the daily 3 questions —
  confirm a new question appears immediately below them, numbered continuing from the daily set.
- Answer it correctly and incorrectly (via retry) — confirm feedback renders the same way as the
  daily quiz questions.
- Click "더 풀기" a few times in a row — confirm each click appends another question.
- Open 오답노트 — confirm a wrong on-demand answer shows up there too (no code change needed for
  this; verifies the session-agnostic assumption in practice).
- Open the new "더 풀기 기록" tab — confirm every on-demand attempt (correct and wrong, including
  retries) appears, newest first.
- Trigger a reading-type practice question (may take a few clicks given weighting) — confirm it
  reads naturally grounded in a reference excerpt, same quality bar as the daily session's reading
  questions.
