# 일일 퀴즈 진도/복습 분할 + 세션 타이머 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each book's daily quiz grows from 3 random questions to 10 (5 bounded to today's newly assigned pages, 5 bounded to the whole textbook), shuffled together with no visible grouping, plus a simple count-up session timer that turns red past 15 minutes and keeps counting.

**Architecture:** `generateFromRandomPage` gains an optional `minPage` bound (default 1, fully backward compatible). `assembleDailySession` builds 10 per-book generation requests via a new pure, independently-testable `buildQuizGenerationRequests` helper (5 requests bounded to `[range.startPage, range.endPage]`, 5 bounded to `[1, book.total_pages]`), shuffles them, then calls `generateFromRandomPage` for each exactly as before. A new client-only `SessionTimer` component tracks elapsed time from a `Date.now()` timestamp captured when the user clicks "오늘의 학습 시작하기", independent of the quiz-generation changes.

**Tech Stack:** Next.js App Router, TypeScript, Vitest + `@testing-library/react`, Supabase.

## Global Constraints

- `minPage` on `generateFromRandomPage` must default to `1` so every existing caller (더 풀기's `generateQuizPractice.ts`, and any test that doesn't pass it) behaves identically to today.
- No new database columns and no visual "오늘 진도" / "복습" labels — the 10 questions are combined and shuffled into one undifferentiated list, per explicit user decision.
- The review-group range is `[1, book.total_pages]` (the whole textbook), not `[1, range.endPage]` (pages covered so far) — this is a deliberate widening from the current random-question behavior, not a bug.
- Timer: `MM:SS / 15:00` while `elapsed <= 15:00`, switches to a red style and keeps counting with no upper bound once `elapsed > 15:00`. No hard cutoff, no blocking behavior.

---

### Task 1: `minPage` support in `generateFromRandomPage`

**Files:**
- Modify: `src/lib/quiz/generateFromRandomPage.ts`
- Test: `src/lib/quiz/generateFromRandomPage.test.ts`

**Interfaces:**
- Produces: `GenerateFromRandomPageInput.minPage?: number` (optional, defaults to `1` inside the function) — Task 2 will pass this explicitly for the progress-group requests and omit it for review-group requests.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/quiz/generateFromRandomPage.test.ts`, inside the existing `describe('generateFromRandomPage', ...)` block:

```ts
  it('never draws a page below minPage even when earlier pages exist in book_pages', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // would resolve to page 1 without minPage
    const supabase = createMockSupabase(
      baseTables({
        book_pages: [
          { book_id: 'b1', page_num: 1, content: '범위 밖 페이지' },
          { book_id: 'b1', page_num: 5, content: '범위 안 페이지' },
        ],
      })
    );

    const result = await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      minPage: 5,
      maxPage: 10,
      type: 'grammar',
    });

    expect(result.sourcePage).toBe(5);
    randomSpy.mockRestore();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generateFromRandomPage`
Expected: FAIL — `minPage` isn't a recognized field yet / the draw ignores it and can return page 1, so `result.sourcePage` won't reliably be `5`. (TypeScript will also flag `minPage` as an unknown property once strict-checked; the test failing at runtime is sufficient here.)

- [ ] **Step 3: Add `minPage` to the input type and page-drawing helpers**

In `src/lib/quiz/generateFromRandomPage.ts`, change the interface:

```ts
export interface GenerateFromRandomPageInput {
  bookId: string;
  bookName: string;
  minPage?: number;
  maxPage: number;
  type: QuestionType;
}
```

Replace `randomPage` and `randomUntriedPage`:

```ts
function randomPage(minPage: number, maxPage: number): number {
  return Math.floor(Math.random() * (maxPage - minPage + 1)) + minPage;
}

/** Draws a page not yet in `tried`, unless every page in [minPage, maxPage] has already been tried. */
function randomUntriedPage(minPage: number, maxPage: number, tried: Set<number>): number {
  const rangeSize = maxPage - minPage + 1;
  let pageNum = randomPage(minPage, maxPage);
  while (tried.has(pageNum) && tried.size < rangeSize) {
    pageNum = randomPage(minPage, maxPage);
  }
  return pageNum;
}
```

- [ ] **Step 4: Thread `minPage` through `generateFromRandomPage`'s body**

In the same file, update the function body. The single-page retry loop:

```ts
export async function generateFromRandomPage(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateFromRandomPageInput
): Promise<RandomPageGenerationResult> {
  const minPage = input.minPage ?? 1;

  let referenceExcerpts: string[] | undefined;
  if (input.type === 'reading') {
    const { data: refs } = await (supabase.from('reference_materials') as any)
      .select('content')
      .ilike('name', '%독해%')
      .limit(2);
    referenceExcerpts = (refs ?? []).map((r: any) => r.content);
  }

  let lastError: unknown;
  const triedPages = new Set<number>();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pageNum = randomUntriedPage(minPage, input.maxPage, triedPages);
    triedPages.add(pageNum);
```

(The rest of the loop body is unchanged.) Then update the whole-range fallback query and its clamp:

```ts
  try {
    const { data: allPages } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', input.bookId)
      .gte('page_num', minPage)
      .lte('page_num', input.maxPage);
    if (allPages?.length) {
      const combined = allPages.map((p: any) => ({ pageNum: p.page_num, content: p.content }));
      const [generated] = await generateQuestions(aiClient, {
        bookName: input.bookName,
        pages: combined,
        types: [input.type],
        referenceExcerpts,
      });

      const combinedContent = combined.map((p: any) => p.content).join('\n\n');
      const review = await reviewGeneratedQuestion(aiClient, combinedContent, generated);
      if (review.ok) {
        // Now Claude picked among many pages, so its sourcePage can't be trusted blindly —
        // clamp into range the same way the daily session's essay path already does.
        const sourcePage = Math.min(Math.max(Number(generated.sourcePage) || minPage, minPage), input.maxPage);
        return { ...generated, sourcePage, usedReference: !!referenceExcerpts?.length };
      }
      lastError = review.error;
    }
  } catch (err) {
    lastError = err;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- generateFromRandomPage`
Expected: PASS, including all pre-existing tests in this file (they don't pass `minPage`, so it defaults to `1` and the arithmetic is unchanged — e.g. `floor(0.4 * (10-1+1)) + 1 === floor(0.4*10)+1`, identical to the old formula).

- [ ] **Step 6: Type-check and full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/quiz/generateFromRandomPage.ts src/lib/quiz/generateFromRandomPage.test.ts
git commit -m "feat: add minPage bound to generateFromRandomPage"
```

---

### Task 2: Split daily quiz questions into progress (5) + review (5), shuffled

**Files:**
- Modify: `src/lib/session/assembleDailySession.ts`
- Test: `src/lib/session/assembleDailySession.test.ts`

**Interfaces:**
- Consumes: `generateFromRandomPage(supabase, aiClient, { bookId, bookName, minPage?, maxPage, type })` from Task 1.
- Produces: `shuffle<T>(arr: T[], rng?: () => number): T[]` and `buildQuizGenerationRequests(book: { total_pages: number }, range: { startPage: number; endPage: number }, quizWeights: Record<QuestionType, number>, rng?: () => number): QuizGenerationRequest[]` where `QuizGenerationRequest = { type: QuestionType; minPage?: number; maxPage: number }` — both exported for direct unit testing and reused by `generateQuestionsForBook`.

- [ ] **Step 1: Write the failing tests for the new pure helpers**

Add to `src/lib/session/assembleDailySession.test.ts`. First update the import at the top of the file:

```ts
import { assembleDailySession, buildQuizGenerationRequests, shuffle } from './assembleDailySession';
```

Then add two new `describe` blocks at the end of the file, before the final closing of the file (after the existing `describe('assembleDailySession', ...)` block):

```ts
describe('shuffle', () => {
  it('reorders elements using the provided rng instead of preserving insertion order', () => {
    const input = [1, 2, 3, 4, 5];
    const rngValues = [0.9, 0.1, 0.9, 0.1];
    let i = 0;
    const rng = () => rngValues[i++];

    const result = shuffle(input, rng);

    expect(result).not.toEqual(input);
    expect([...result].sort()).toEqual(input);
  });
});

describe('buildQuizGenerationRequests', () => {
  it('splits into 5 requests bounded to the daily range and 5 bounded to the whole book', () => {
    const book = { total_pages: 100 };
    const range = { startPage: 10, endPage: 15 };
    const quizWeights = { grammar: 1, vocab: 1, reading: 1, theory: 1 } as any;

    const requests = buildQuizGenerationRequests(book, range, quizWeights);

    expect(requests).toHaveLength(10);
    const progressRequests = requests.filter((r) => r.minPage === 10 && r.maxPage === 15);
    const reviewRequests = requests.filter((r) => r.maxPage === 100 && r.minPage === undefined);
    expect(progressRequests).toHaveLength(5);
    expect(reviewRequests).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- assembleDailySession`
Expected: FAIL — `buildQuizGenerationRequests` and `shuffle` don't exist yet (import error / undefined).

- [ ] **Step 3: Implement `shuffle` and `buildQuizGenerationRequests`**

In `src/lib/session/assembleDailySession.ts`, add the import and replace the `QUESTIONS_PER_BOOK` constant:

```ts
import type { QuestionType } from '@/types/db';
```

(add alongside the existing imports at the top of the file)

```ts
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
  const progressTypes = pickWeightedTypes(quizWeights, QUESTIONS_PROGRESS_PER_BOOK, rng);
  const reviewTypes = pickWeightedTypes(quizWeights, QUESTIONS_REVIEW_PER_BOOK, rng);

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- assembleDailySession`
Expected: the two new tests PASS. The rest of the file's tests will still be running against the *old* `generateQuestionsForBook` at this point (Step 3 didn't touch it yet), so they should still pass unchanged too.

- [ ] **Step 5: Wire `buildQuizGenerationRequests` into `generateQuestionsForBook`**

In `src/lib/session/assembleDailySession.ts`, inside `generateQuestionsForBook`, replace:

```ts
  const quizWeights = Object.fromEntries(
    QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
  ) as Record<(typeof QUIZ_TYPES)[number], number>;
  const types = pickWeightedTypes(quizWeights as any, QUESTIONS_PER_BOOK);

  // Quiz questions are sourced from the book's full range covered by today (1..endPage), not
  // just today's assigned slice, so review of earlier material is mixed in for spaced
  // retrieval practice. Each question gets its own independently random page, and all of a
  // book's questions (plus its essay question, if any) generate concurrently.
  const quizGenerations = types.map((type) =>
    generateFromRandomPage(supabase, aiClient, {
      bookId: book.id,
      bookName: book.name,
      maxPage: Math.max(1, range.endPage),
      type,
    })
  );
```

with:

```ts
  const quizWeights = Object.fromEntries(
    QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
  ) as Record<(typeof QUIZ_TYPES)[number], number>;
  const quizRequests = buildQuizGenerationRequests(book, range, quizWeights as any);

  // 5 questions are bounded to today's newly assigned pages (immediate check on what was just
  // read); 5 are bounded to the whole textbook, including pages not yet reached, for broader
  // retrieval practice. The two groups are pre-shuffled by buildQuizGenerationRequests so they
  // render mixed together. Each question gets its own independently random page, and all of a
  // book's questions (plus its essay question, if any) generate concurrently.
  const quizGenerations = quizRequests.map((req) =>
    generateFromRandomPage(supabase, aiClient, {
      bookId: book.id,
      bookName: book.name,
      minPage: req.minPage,
      maxPage: req.maxPage,
      type: req.type,
    })
  );
```

- [ ] **Step 6: Update the two existing tests whose assumptions change**

In `src/lib/session/assembleDailySession.test.ts`, update the fixture comment (currently above the `book_pages` array in `baseTables`):

Replace:
```ts
  // The fixture book's pacing yields endPage 3 for 2026-08-03 (see calculateDailyRange).
  // Quiz questions are now sourced from a random page across [1, endPage], so every page in
  // that range needs a row here or the random draw can miss and (correctly) retry/fail.
```

with:

```ts
  // The fixture book's pacing yields startPage 1 / endPage 3 for 2026-08-03 (see
  // calculateDailyRange). Progress-group quiz questions draw from [startPage, endPage]; every
  // page in that range needs a row here or the random draw can miss and (correctly)
  // retry/fail. Review-group questions draw from [1, total_pages] (100), which is sparser by
  // design — real books have far more history than what's covered so far.
```

Then replace the `'ignores a hallucinated quiz sourcePage...'` test (its old assumption — that every quiz question is bounded to `endPage`, 3 — no longer holds for the review group):

```ts
  it('ignores a hallucinated quiz sourcePage and always records the actual page the question was generated from', async () => {
    const supabase = createMockSupabase(baseTables);
    vi.mocked(generateQuestions).mockImplementation(async (_client: any, input: any) => {
      if (input.types.includes('essay')) {
        return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
      }
      // Claude claims page 999, which is nowhere near the fed page.
      return [{ type: input.types[0], sourcePage: 999, prompt: 'q', correctAnswer: 'a' }];
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    const quizQuestions = supabase.inserted.questions.filter((q: any) => q.type !== 'essay');
    for (const q of quizQuestions) {
      expect(q.source_page).toBeGreaterThanOrEqual(1);
      expect(q.source_page).toBeLessThanOrEqual(3);
      expect(q.source_page).not.toBe(999);
    }
  });
```

with:

```ts
  it('ignores a hallucinated quiz sourcePage and always records a page within the requested range', async () => {
    const supabase = createMockSupabase(baseTables);
    vi.mocked(generateQuestions).mockImplementation(async (_client: any, input: any) => {
      if (input.types.includes('essay')) {
        return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
      }
      // Claude claims page 999, which is nowhere near any page it was actually fed.
      return [{ type: input.types[0], sourcePage: 999, prompt: 'q', correctAnswer: 'a' }];
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    // Progress-group questions are bounded to [1, 3] (today's range); review-group questions
    // are bounded to [1, 100] (book.total_pages) and can legitimately land beyond page 3.
    const quizQuestions = supabase.inserted.questions.filter((q: any) => q.type !== 'essay');
    expect(quizQuestions).toHaveLength(10);
    for (const q of quizQuestions) {
      expect(q.source_page).toBeGreaterThanOrEqual(1);
      expect(q.source_page).toBeLessThanOrEqual(100);
      expect(q.source_page).not.toBe(999);
    }
  });
```

- [ ] **Step 7: Run the full test file to verify everything passes**

Run: `npm test -- assembleDailySession`
Expected: PASS — all tests in the file, including the two new helper tests and the two updated tests.

- [ ] **Step 8: Type-check and full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/session/assembleDailySession.ts src/lib/session/assembleDailySession.test.ts
git commit -m "feat: split daily quiz into 5 progress-linked + 5 whole-book review questions"
```

---

### Task 3: `SessionTimer` component

**Files:**
- Create: `src/app/components/SessionTimer.tsx`
- Create: `src/app/components/SessionTimer.module.css`
- Test: `src/app/components/SessionTimer.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `export default function SessionTimer({ startedAt }: { startedAt: number })` — a React component. Task 4 renders `<SessionTimer startedAt={someEpochMs} />` once the session has started.

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/SessionTimer.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import SessionTimer from './SessionTimer';

describe('SessionTimer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows 00:00 / 15:00 immediately after starting', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();

    render(<SessionTimer startedAt={startedAt} />);

    expect(screen.getByText('00:00 / 15:00')).toBeInTheDocument();
  });

  it('counts up every second while under the 15-minute target', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    render(<SessionTimer startedAt={startedAt} />);

    act(() => {
      vi.advanceTimersByTime(65_000);
    });

    expect(screen.getByText('01:05 / 15:00')).toBeInTheDocument();
  });

  it('turns red and keeps counting past the 15-minute target', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    render(<SessionTimer startedAt={startedAt} />);

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 90 * 1000); // 16:30 elapsed
    });

    const timer = screen.getByText('16:30 / 15:00');
    expect(timer).toBeInTheDocument();
    expect(timer.className).toMatch(/over/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SessionTimer`
Expected: FAIL — `./SessionTimer` doesn't exist yet.

- [ ] **Step 3: Add the `--timer-over-color` CSS variable**

In `src/app/globals.css`, inside the existing `:root { ... }` block, add one line after `--quiz-practice-accent-text: #1f4d80;`:

```css
  --timer-over-color: #c0392b;
```

- [ ] **Step 4: Create the component's CSS module**

Create `src/app/components/SessionTimer.module.css`:

```css
.timer {
  display: block;
  width: fit-content;
  margin: 0 auto 16px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--card-background);
  border: 1px solid var(--card-border);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  position: sticky;
  top: 8px;
  z-index: 10;
}

.over {
  color: var(--timer-over-color);
  border-color: var(--timer-over-color);
}
```

- [ ] **Step 5: Implement the component**

Create `src/app/components/SessionTimer.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './SessionTimer.module.css';

const TARGET_MS = 15 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface SessionTimerProps {
  startedAt: number;
}

export default function SessionTimer({ startedAt }: SessionTimerProps) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const overTarget = elapsedMs > TARGET_MS;

  return (
    <div className={`${styles.timer} ${overTarget ? styles.over : ''}`}>
      {formatElapsed(elapsedMs)} / {formatElapsed(TARGET_MS)}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- SessionTimer`
Expected: PASS, all 3 tests.

- [ ] **Step 7: Type-check and full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/components/SessionTimer.tsx src/app/components/SessionTimer.module.css src/app/components/SessionTimer.test.tsx src/app/globals.css
git commit -m "feat: add SessionTimer component (count-up, red past 15 minutes)"
```

---

### Task 4: Mount `SessionTimer` in the session page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `SessionTimer` from Task 3 (`import SessionTimer from './components/SessionTimer'`).

- [ ] **Step 1: Write the failing test**

In `src/app/page.test.tsx`, add a new test inside `describe('Daily session page', ...)`, after the existing `'shows the book section with questions after clicking start'` test:

```tsx
  it('shows a count-up timer against the 15-minute target after starting', async () => {
    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));

    expect(await screen.findByText('00:00 / 15:00')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- page.test`
Expected: FAIL — no element with text `00:00 / 15:00` exists yet.

- [ ] **Step 3: Wire the timer into `page.tsx`**

In `src/app/page.tsx`, add the import:

```tsx
import SessionTimer from './components/SessionTimer';
```

Add a `startedAt` state next to the existing `started` state:

```tsx
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
```

Replace the inline `onStart={() => setStarted(true)}` with a named handler that also captures the start timestamp. Change:

```tsx
  if (!started) {
    return (
      <main className={styles.page}>
        <CoverScreen bookRanges={data.bookRanges} onStart={() => setStarted(true)} />
      </main>
    );
  }
```

to:

```tsx
  if (!started) {
    return (
      <main className={styles.page}>
        <CoverScreen
          bookRanges={data.bookRanges}
          onStart={() => {
            setStarted(true);
            setStartedAt(Date.now());
          }}
        />
      </main>
    );
  }
```

Then render the timer at the top of the session view. Change:

```tsx
  return (
    <main className={styles.page}>
      {data.bookRanges.map((range) => {
```

to:

```tsx
  return (
    <main className={styles.page}>
      {startedAt !== null && <SessionTimer startedAt={startedAt} />}
      {data.bookRanges.map((range) => {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- page.test`
Expected: PASS, including all pre-existing tests in this file.

- [ ] **Step 5: Type-check and full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass (this is the last task, so this is the final full-suite check for the whole feature).

- [ ] **Step 6: Manual smoke test in the browser**

Run: `npm run dev`, open the app, click "오늘의 학습 시작하기 →", and confirm the timer badge appears and counts up once per second. To confirm the red-past-15-minutes styling without waiting 15 minutes, temporarily change `TARGET_MS` in `src/app/components/SessionTimer.tsx` to `5 * 1000` (5 seconds), reload, watch it flip to red after 5 seconds, then revert the change (do not commit the temporary value).

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: mount SessionTimer on the daily session page"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1+2 implement the 5 progress + 5 review split with `minPage`/whole-book bounds and the no-visible-grouping shuffle (spec §1). Task 3+4 implement the count-up timer with the 15-minute red threshold (spec §2). The spec's "범위 밖" section (더 풀기, 서술형, 오답노트, 진도 확인) is untouched by every task above — no task modifies those files. 교육학 automatically receives the same 10-question pattern once its `books` row exists, since `assembleDailySession` already loops over all rows in `books` — no separate task needed, per the spec.
- **Placeholder scan:** no TBD/TODO; every step has literal code, not descriptions.
- **Type consistency:** `QuizGenerationRequest { type: QuestionType; minPage?: number; maxPage: number }` (Task 2) matches the `minPage?`/`maxPage` fields consumed by `GenerateFromRandomPageInput` (Task 1). `SessionTimer({ startedAt: number })` (Task 3) matches the `startedAt` value (`Date.now()`, a `number`) passed from `page.tsx` (Task 4).
