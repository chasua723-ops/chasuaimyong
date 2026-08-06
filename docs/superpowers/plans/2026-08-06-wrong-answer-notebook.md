# 오답노트 (Wrong Answer Notebook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/notebook` review screen that surfaces every quiz question the user has ever gotten
wrong, grouped by type, reachable via a binder-style tab on the cover screen, with in-place retry.

**Architecture:** A new pure data-layer function (`getWrongNotes`) derives notebook state from the
existing `questions` + `attempts` + `books` tables (no schema changes). A thin `GET /api/notebook`
route exposes it. A new `/notebook` page renders it, reusing the existing `QuizQuestion` component
(extended with an `overcome` display mode) and the existing `POST /api/attempts` endpoint for
retries. A vertical tab added to `CoverScreen` links to the new page.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, CSS Modules, Vitest + Testing Library —
same stack as the rest of the app, no new dependencies.

## Global Constraints

- No new npm dependencies.
- No new database tables or columns — notebook state is derived from `questions` + `attempts` +
  `books` at query time.
- All user-facing text is Korean, matching the existing app's tone.
- Follow the existing CSS Modules pattern: shared question/session-card styles live in
  `src/app/components/session.module.css`; a new page gets its own co-located `*.module.css`.
- This codebase does not unit-test API route handlers directly (no `route.test.ts` files exist
  anywhere in the repo) — routes are thin wrappers verified through the page-level integration test
  that mocks `fetch`, matching the existing convention (see `src/app/page.test.tsx`). Do not add a
  `route.test.ts` for `/api/notebook`.
- `/notebook` and `/api/notebook` are automatically PIN-gated already — `src/middleware.ts` matches
  every path except `_next/static`, `_next/image`, and `favicon.ico`. No middleware changes needed.

---

### Task 1: Design tokens + `QuizQuestion` overcome display mode

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/components/session.module.css`
- Modify: `src/app/components/QuizQuestion.tsx`
- Create: `src/app/components/QuizQuestion.test.tsx`

**Interfaces:**
- Consumes: existing `Question`, `QuizFeedback` types from `src/app/components/types.ts` (unchanged).
- Produces: `QuizQuestion` gains two new optional props — `overcome?: boolean` (default `false`) and
  `attemptCount?: number`. Existing callers (`BookSection.tsx`) that don't pass these props are
  unaffected (defaults preserve current behavior). Later tasks (Task 5) will pass both.

- [ ] **Step 1: Write the failing tests for the new `overcome` mode**

Create `src/app/components/QuizQuestion.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizQuestion from './QuizQuestion';
import type { Question } from './types';

const question: Question = {
  id: 'q1',
  book_id: 'b1',
  type: 'grammar',
  prompt: '把자문의 어순은?',
  choices: ['A', 'B'],
  source_page: 12,
};

describe('QuizQuestion', () => {
  it('calls onSubmit with the chosen answer when not overcome', async () => {
    const onSubmit = vi.fn();
    render(<QuizQuestion question={question} index={1} feedback={undefined} onSubmit={onSubmit} />);

    await userEvent.setup().click(screen.getByText('A'));

    expect(onSubmit).toHaveBeenCalledWith('q1', 'A');
  });

  it('does not render an overcome badge by default', () => {
    render(<QuizQuestion question={question} index={1} feedback={undefined} onSubmit={vi.fn()} />);

    expect(screen.queryByText('극복됨')).not.toBeInTheDocument();
  });

  it('renders a muted, disabled card with an overcome badge when overcome is true', async () => {
    const onSubmit = vi.fn();
    render(
      <QuizQuestion question={question} index={1} feedback={undefined} onSubmit={onSubmit} overcome />
    );

    expect(screen.getByText('극복됨')).toBeInTheDocument();
    const choiceButton = screen.getByText('A');
    expect(choiceButton).toBeDisabled();

    await userEvent.setup().click(choiceButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the attempt count when overcome and attemptCount are both provided', () => {
    render(
      <QuizQuestion
        question={question}
        index={1}
        feedback={undefined}
        onSubmit={vi.fn()}
        overcome
        attemptCount={3}
      />
    );

    expect(screen.getByText('3번 시도 만에 정답')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- QuizQuestion`
Expected: FAIL — `overcome`/`attemptCount` props don't exist yet, no "극복됨" text is ever rendered.

- [ ] **Step 3: Add the notebook color tokens**

In `src/app/globals.css`, add three new variables inside the existing `:root { ... }` block (after
`--vocab-border`):

```css
  --notebook-accent: #f4832b;
  --notebook-accent-bg: #fef1e2;
  --notebook-accent-text: #b5590a;
```

- [ ] **Step 4: Add the overcome-mode styles**

In `src/app/components/session.module.css`, add after the `.feedbackWrong` rule:

```css
.questionCardOvercome {
  opacity: 0.6;
}

.questionPromptRow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.questionPromptRow .questionPrompt {
  margin-bottom: 0;
}

.overcomeBadge {
  font-size: 9px;
  font-weight: 600;
  color: var(--notebook-accent-text);
  background: var(--notebook-accent-bg);
  padding: 2px 7px;
  border-radius: 999px;
  white-space: nowrap;
}

.overcomeMeta {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.choiceButton:disabled {
  cursor: default;
  opacity: 0.5;
}
```

- [ ] **Step 5: Implement the `overcome`/`attemptCount` props on `QuizQuestion`**

Replace the full contents of `src/app/components/QuizQuestion.tsx`:

```tsx
'use client';

import type { Question, QuizFeedback } from './types';
import styles from './session.module.css';

interface QuizQuestionProps {
  question: Question;
  index: number;
  feedback: QuizFeedback | undefined;
  onSubmit: (questionId: string, answer: string) => void;
  overcome?: boolean;
  attemptCount?: number;
}

export default function QuizQuestion({
  question,
  index,
  feedback,
  onSubmit,
  overcome = false,
  attemptCount,
}: QuizQuestionProps) {
  return (
    <div className={overcome ? `${styles.questionCard} ${styles.questionCardOvercome}` : styles.questionCard}>
      <div className={styles.questionPromptRow}>
        <p className={styles.questionPrompt}>
          Q{index}. {question.prompt}
        </p>
        {overcome && <span className={styles.overcomeBadge}>극복됨</span>}
      </div>
      <div className={styles.choiceList}>
        {(question.choices ?? []).map((choice) => (
          <button
            key={choice}
            className={styles.choiceButton}
            disabled={overcome}
            onClick={() => onSubmit(question.id, choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      {overcome && attemptCount !== undefined && (
        <p className={styles.overcomeMeta}>{attemptCount}번 시도 만에 정답</p>
      )}
      {feedback === 'correct' && <p className={styles.feedbackCorrect}>정답입니다</p>}
      {feedback && feedback !== 'correct' && (
        <p className={styles.feedbackWrong}>
          {feedback.explanation} ({feedback.sourcePage}페이지 참고)
        </p>
      )}
    </div>
  );
}
```

Note: a `disabled` button never fires its `onClick` handler in the DOM, so `onSubmit` is safely
unreachable when `overcome` is true even though the handler itself doesn't re-check the flag.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- QuizQuestion`
Expected: PASS (4/4). Also run `npm test -- BookSection` and `npm test -- page.test` to confirm the
existing callers of `QuizQuestion` are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/components/session.module.css src/app/components/QuizQuestion.tsx src/app/components/QuizQuestion.test.tsx
git commit -m "feat: add notebook color tokens and overcome mode to QuizQuestion"
```

---

### Task 2: `getWrongNotes` data layer

**Files:**
- Create: `src/lib/notebook/getWrongNotes.ts`
- Create: `src/lib/notebook/getWrongNotes.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`; reads `questions`, `attempts`, `books`
  tables (existing schema, `supabase/migrations/0001_init.sql`); `QuestionType` from `@/types/db`.
- Produces (used by Task 3):
  ```ts
  export interface WrongNoteQuestion {
    id: string;
    prompt: string;
    choices: string[] | null;
    sourcePage: number;
    bookName: string;
    overcome: boolean;
    attemptCount: number;
  }
  export interface WrongNoteGroup {
    type: QuestionType;
    label: string;
    outstandingCount: number;
    totalCount: number;
    questions: WrongNoteQuestion[];
  }
  export async function getWrongNotes(supabase: SupabaseClient): Promise<WrongNoteGroup[]>
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/notebook/getWrongNotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getWrongNotes } from './getWrongNotes';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    questions: [],
    attempts: [],
    books: [{ id: 'b1', name: '전공중국어 문법' }],
    ...overrides,
  };
}

describe('getWrongNotes', () => {
  it('excludes a question that has never been answered incorrectly', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'grammar', prompt: 'Q1', choices: ['A'], source_page: 1 },
        ],
        attempts: [{ question_id: 'q1', is_correct: true, created_at: '2026-08-01T00:00:00Z' }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(0);
  });

  it('classifies a question whose latest attempt is wrong as outstanding', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'reading', prompt: 'Q1', choices: ['A', 'B'], source_page: 5 },
        ],
        attempts: [{ question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      type: 'reading',
      label: '독해',
      outstandingCount: 1,
      totalCount: 1,
    });
    expect(groups[0].questions[0]).toMatchObject({
      id: 'q1',
      overcome: false,
      attemptCount: 1,
      bookName: '전공중국어 문법',
    });
  });

  it('classifies a question as overcome when the latest attempt is correct after an earlier wrong attempt', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'grammar', prompt: 'Q1', choices: ['A', 'B'], source_page: 5 },
        ],
        attempts: [
          { question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' },
          { question_id: 'q1', is_correct: false, created_at: '2026-08-02T00:00:00Z' },
          { question_id: 'q1', is_correct: true, created_at: '2026-08-03T00:00:00Z' },
        ],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups[0]).toMatchObject({ outstandingCount: 0, totalCount: 1 });
    expect(groups[0].questions[0]).toMatchObject({ overcome: true, attemptCount: 3 });
  });

  it('excludes essay questions even when wrong', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', type: 'essay', prompt: 'Q1', choices: null, source_page: 5 }],
        attempts: [{ question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(0);
  });

  it('excludes a question with no attempts at all', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', type: 'grammar', prompt: 'Q1', choices: ['A'], source_page: 1 }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(0);
  });

  it('groups questions by type, ordered grammar, vocab, reading, theory', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'theory', prompt: 'T1', choices: ['A'], source_page: 1 },
          { id: 'q2', book_id: 'b1', type: 'grammar', prompt: 'G1', choices: ['A'], source_page: 2 },
        ],
        attempts: [
          { question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' },
          { question_id: 'q2', is_correct: false, created_at: '2026-08-01T00:00:00Z' },
        ],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups.map((g) => g.type)).toEqual(['grammar', 'theory']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- getWrongNotes`
Expected: FAIL with "Cannot find module './getWrongNotes'".

- [ ] **Step 3: Implement `getWrongNotes`**

Create `src/lib/notebook/getWrongNotes.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestionType } from '@/types/db';

export interface WrongNoteQuestion {
  id: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
  bookName: string;
  overcome: boolean;
  attemptCount: number;
}

export interface WrongNoteGroup {
  type: QuestionType;
  label: string;
  outstandingCount: number;
  totalCount: number;
  questions: WrongNoteQuestion[];
}

const TYPE_ORDER: QuestionType[] = ['grammar', 'vocab', 'reading', 'theory'];
const TYPE_LABELS: Record<string, string> = {
  grammar: '문법',
  vocab: '어휘',
  reading: '독해',
  theory: '이론',
};

export async function getWrongNotes(supabase: SupabaseClient): Promise<WrongNoteGroup[]> {
  const { data: questions } = await (supabase.from('questions') as any).select('*');
  const { data: attempts } = await (supabase.from('attempts') as any).select('*');
  const { data: books } = await (supabase.from('books') as any).select('*');

  const bookNameById = new Map((books ?? []).map((b: any) => [b.id, b.name]));

  const attemptsByQuestion = new Map<string, any[]>();
  for (const attempt of attempts ?? []) {
    const list = attemptsByQuestion.get(attempt.question_id) ?? [];
    list.push(attempt);
    attemptsByQuestion.set(attempt.question_id, list);
  }

  const groupsByType = new Map<string, WrongNoteGroup>();

  for (const question of questions ?? []) {
    if (question.type === 'essay') continue;

    const attemptsForQuestion = (attemptsByQuestion.get(question.id) ?? [])
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (attemptsForQuestion.length === 0) continue;

    const hasEverBeenWrong = attemptsForQuestion.some((a) => a.is_correct === false);
    if (!hasEverBeenWrong) continue;

    const latestAttempt = attemptsForQuestion[attemptsForQuestion.length - 1];
    const overcome = latestAttempt.is_correct === true;

    if (!groupsByType.has(question.type)) {
      groupsByType.set(question.type, {
        type: question.type,
        label: TYPE_LABELS[question.type] ?? question.type,
        outstandingCount: 0,
        totalCount: 0,
        questions: [],
      });
    }

    const group = groupsByType.get(question.type)!;
    group.totalCount += 1;
    if (!overcome) group.outstandingCount += 1;
    group.questions.push({
      id: question.id,
      prompt: question.prompt,
      choices: question.choices ?? null,
      sourcePage: question.source_page,
      bookName: bookNameById.get(question.book_id) ?? '',
      overcome,
      attemptCount: attemptsForQuestion.length,
    });
  }

  return TYPE_ORDER.filter((type) => groupsByType.has(type)).map((type) => groupsByType.get(type)!);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- getWrongNotes`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notebook/getWrongNotes.ts src/lib/notebook/getWrongNotes.test.ts
git commit -m "feat: add getWrongNotes data layer for the wrong-answer notebook"
```

---

### Task 3: `GET /api/notebook` route

**Files:**
- Create: `src/app/api/notebook/route.ts`

**Interfaces:**
- Consumes: `getWrongNotes(supabase)` from Task 2.
- Produces: `GET /api/notebook` → `200 { groups: WrongNoteGroup[] }` on success, `500 { error: string }`
  on failure. Consumed by Task 5's page via `fetch('/api/notebook')`.

- [ ] **Step 1: Implement the route**

Create `src/app/api/notebook/route.ts`, following the exact error-handling shape of the existing
`src/app/api/session/today/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getWrongNotes } from '@/lib/notebook/getWrongNotes';

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const groups = await getWrongNotes(supabase);
    return NextResponse.json({ groups });
  } catch (err) {
    console.error('[GET /api/notebook] failed:', err);
    return NextResponse.json({ error: 'Failed to load wrong-answer notebook' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the project still typechecks and builds**

Run: `npx tsc --noEmit`
Expected: no errors.

This route is exercised end-to-end by Task 5's page-level test (which mocks `fetch('/api/notebook')`
the same way `src/app/page.test.tsx` mocks `fetch('/api/session/today')`) — per the Global
Constraints, no separate `route.test.ts` is added, matching the rest of the codebase.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notebook/route.ts
git commit -m "feat: add GET /api/notebook route"
```

---

### Task 4: Binder tab on `CoverScreen`

**Files:**
- Modify: `src/app/components/CoverScreen.tsx`
- Modify: `src/app/components/session.module.css`
- Modify: `src/app/components/CoverScreen.test.tsx`

**Interfaces:**
- Consumes: `next/link`'s `Link` component (already a transitive Next.js dependency, no install
  needed).
- Produces: no new exports — purely a visual/navigation addition to `CoverScreen`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/components/CoverScreen.test.tsx` (inside the existing `describe` block, after the
second `it`):

```tsx
  it('links to the wrong-answer notebook via the binder tab', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText('오답노트').closest('a');
    expect(link).toHaveAttribute('href', '/notebook');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CoverScreen`
Expected: FAIL — no element with text "오답노트" exists yet.

- [ ] **Step 3: Add the tab styles**

In `src/app/components/session.module.css`, change the existing `.cover` rule to add `position:
relative;`:

```css
.cover {
  position: relative;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}
```

Then add a new rule after `.startButton`:

```css
.notebookTab {
  position: absolute;
  right: -20px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--notebook-accent);
  color: #ffffff;
  border-radius: 0 8px 8px 0;
  padding: 14px 6px;
  font-size: 12px;
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}
```

- [ ] **Step 4: Add the `Link` to `CoverScreen`**

In `src/app/components/CoverScreen.tsx`, add the import and the link. Full file:

```tsx
'use client';

import Link from 'next/link';
import type { BookRange } from './types';
import styles from './session.module.css';

interface CoverScreenProps {
  bookRanges: BookRange[];
  onStart: () => void;
}

function formatToday(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

export default function CoverScreen({ bookRanges, onStart }: CoverScreenProps) {
  return (
    <div className={styles.cover}>
      <div className={styles.coverDate}>{formatToday()}</div>
      <h1 className={styles.coverTitle}>오늘의 학습</h1>
      <div className={styles.coverRanges}>
        {bookRanges.map((r) => (
          <div key={r.bookId} className={styles.coverRangeItem}>
            {r.name} · {r.startPage}~{r.endPage}p
          </div>
        ))}
      </div>
      <button className={styles.startButton} onClick={onStart}>
        오늘의 학습 시작하기 →
      </button>
      <Link href="/notebook" className={styles.notebookTab}>
        오답노트
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- CoverScreen`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/CoverScreen.tsx src/app/components/session.module.css src/app/components/CoverScreen.test.tsx
git commit -m "feat: add binder-style notebook tab to the cover screen"
```

---

### Task 5: `/notebook` page

**Files:**
- Create: `src/app/notebook/page.tsx`
- Create: `src/app/notebook/notebook.module.css`
- Create: `src/app/notebook/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/notebook` (Task 3) → `{ groups: WrongNoteGroup[] }`; `POST /api/attempts`
  (existing, unchanged) → `{ isCorrect: boolean, explanation?: string, sourcePage?: number }`;
  `QuizQuestion` (Task 1) with its `overcome`/`attemptCount` props; `QuizFeedback` type from
  `src/app/components/types.ts`.
- Produces: the `/notebook` route, no exports consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

Create `src/app/notebook/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotebookPage from './page';

function mockFetch(handlers: Record<string, () => any>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const key = init?.method === 'POST' ? `POST ${url}` : url;
      if (key in handlers) return handlers[key]();
      throw new Error(`unhandled fetch: ${key}`);
    })
  );
}

describe('Notebook page', () => {
  beforeEach(() => {
    mockFetch({
      '/api/notebook': () => ({
        ok: true,
        json: async () => ({
          groups: [
            {
              type: 'reading',
              label: '독해',
              outstandingCount: 1,
              totalCount: 2,
              questions: [
                {
                  id: 'q1',
                  prompt: '이 글의 주제로 가장 적절한 것은?',
                  choices: ['A', 'B'],
                  sourcePage: 57,
                  bookName: '독해편기출문제2',
                  overcome: false,
                  attemptCount: 1,
                },
                {
                  id: 'q2',
                  prompt: '밑줄 친 표현의 의미로 옳은 것은?',
                  choices: ['A', 'B'],
                  sourcePage: 12,
                  bookName: '독해편기출문제2',
                  overcome: true,
                  attemptCount: 3,
                },
              ],
            },
          ],
        }),
      }),
      'POST /api/attempts': () => ({
        ok: true,
        json: async () => ({ isCorrect: true }),
      }),
    });
  });

  it('renders the type group header with outstanding/total counts', async () => {
    render(<NotebookPage />);

    expect(await screen.findByText('독해')).toBeInTheDocument();
    expect(screen.getByText('1/2 미해결 (50%)')).toBeInTheDocument();
  });

  it('renders an outstanding question as retryable and an overcome question as muted', async () => {
    render(<NotebookPage />);

    expect(await screen.findByText(/이 글의 주제로 가장 적절한 것은/)).toBeInTheDocument();
    expect(screen.getByText(/밑줄 친 표현의 의미로 옳은 것은/)).toBeInTheDocument();
    expect(screen.getByText('극복됨')).toBeInTheDocument();
    expect(screen.getByText('3번 시도 만에 정답')).toBeInTheDocument();
  });

  it('submits a retry via POST /api/attempts and shows the result', async () => {
    render(<NotebookPage />);

    await screen.findByText(/이 글의 주제로 가장 적절한 것은/);
    const user = userEvent.setup();
    await user.click(screen.getAllByText('A')[0]);

    await waitFor(() => expect(screen.getByText('정답입니다')).toBeInTheDocument());
  });

  it('shows an empty state when there are no wrong-note groups', async () => {
    mockFetch({
      '/api/notebook': () => ({ ok: true, json: async () => ({ groups: [] }) }),
    });

    render(<NotebookPage />);

    expect(await screen.findByText('아직 오답이 없어요 🎉')).toBeInTheDocument();
  });

  it('shows an error message when the notebook request fails', async () => {
    mockFetch({
      '/api/notebook': () => ({ ok: false, status: 500 }),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<NotebookPage />);

    expect(await screen.findByText(/불러오지 못했어요/)).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- notebook/page`
Expected: FAIL with "Cannot find module './page'".

- [ ] **Step 3: Create the page styles**

Create `src/app/notebook/notebook.module.css`:

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
  margin-bottom: 20px;
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  margin-top: 40px;
}

.group {
  margin-bottom: 28px;
}

.groupHeader {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.groupLabel {
  font-size: 14px;
  font-weight: 700;
  color: var(--foreground);
}

.groupStat {
  font-size: 11px;
  color: var(--notebook-accent-text);
  background: var(--notebook-accent-bg);
  padding: 2px 9px;
  border-radius: 999px;
}
```

- [ ] **Step 4: Implement the page**

Create `src/app/notebook/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import QuizQuestion from '../components/QuizQuestion';
import type { QuizFeedback } from '../components/types';
import styles from './notebook.module.css';

interface WrongNoteQuestion {
  id: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
  bookName: string;
  overcome: boolean;
  attemptCount: number;
}

interface WrongNoteGroup {
  type: string;
  label: string;
  outstandingCount: number;
  totalCount: number;
  questions: WrongNoteQuestion[];
}

export default function NotebookPage() {
  const [groups, setGroups] = useState<WrongNoteGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, QuizFeedback>>({});
  const [overcomeOverrides, setOvercomeOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notebook');
        if (!res.ok) throw new Error(`notebook request failed: ${res.status}`);
        const json = (await res.json()) as { groups: WrongNoteGroup[] };
        if (!cancelled) setGroups(json.groups);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('오답노트를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAnswer(questionId: string, userAnswer: string) {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, userAnswer }),
    });
    const result = await res.json();
    setFeedback((prev) => ({
      ...prev,
      [questionId]: result.isCorrect
        ? 'correct'
        : { explanation: result.explanation, sourcePage: result.sourcePage },
    }));
    if (result.isCorrect) {
      setOvercomeOverrides((prev) => ({ ...prev, [questionId]: true }));
    }
  }

  if (error) return <p className={styles.page}>{error}</p>;
  if (!groups) return <p className={styles.page}>불러오는 중...</p>;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>오답노트</h1>

      {groups.length === 0 && <p className={styles.empty}>아직 오답이 없어요 🎉</p>}

      {groups.map((group) => {
        const percentage =
          group.totalCount === 0 ? 0 : Math.round((group.outstandingCount / group.totalCount) * 100);

        return (
          <section key={group.type} className={styles.group}>
            <div className={styles.groupHeader}>
              <span className={styles.groupLabel}>{group.label}</span>
              <span className={styles.groupStat}>
                {group.outstandingCount}/{group.totalCount} 미해결 ({percentage}%)
              </span>
            </div>

            {group.questions.map((q, i) => (
              <QuizQuestion
                key={q.id}
                question={{
                  id: q.id,
                  book_id: '',
                  type: group.type,
                  prompt: q.prompt,
                  choices: q.choices,
                  source_page: q.sourcePage,
                }}
                index={i + 1}
                feedback={feedback[q.id]}
                onSubmit={submitAnswer}
                overcome={overcomeOverrides[q.id] ?? q.overcome}
                attemptCount={q.attemptCount}
              />
            ))}
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- notebook/page`
Expected: PASS (5/5).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the pre-existing suites touched by earlier tasks
(`QuizQuestion`, `BookSection`, `CoverScreen`, `page.test.tsx`).

- [ ] **Step 7: Commit**

```bash
git add src/app/notebook/page.tsx src/app/notebook/notebook.module.css src/app/notebook/page.test.tsx
git commit -m "feat: add /notebook page for reviewing and retrying wrong answers"
```

---

## Manual verification (after all tasks land)

Not a subagent task — do this in the orchestrating session once every task above is merged:

1. `npm run dev`, open the app, log in with the PIN.
2. Complete today's session, deliberately answering one quiz question wrong.
3. Click the orange "오답노트" tab on the cover screen — confirm it navigates to `/notebook` and
   shows the wrong question grouped under its type with a `1/1 미해결 (100%)` header.
4. Retry the question with the correct answer — confirm it shows "정답입니다", turns muted, and gets
   an "극복됨" badge with the attempt count, without a page reload.
5. Reload `/notebook` — confirm the overcome state persisted (re-fetched from the server, not just
   client state).
