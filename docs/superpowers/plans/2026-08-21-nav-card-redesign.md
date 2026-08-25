# 홈 화면 & 카드 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home screen's single-CTA-plus-sideways-tabs layout with a flat, equal-weight
nav card list, and extend the same colored-left-border card convention to the list cards on
오답노트/서술형노트/더 풀기/학습하기 so every list in the app reads consistently.

**Architecture:** Pure CSS/markup change. No new data, routes, or business logic — `CoverScreen`
gets a new `<nav>` of link/button cards replacing its old button+tab-stack; four existing card
classes in four different pages/components each gain a `border-left` accent (three via a one-line
CSS edit, one via a small new wrapper element in `notebook`'s render loop).

**Tech Stack:** Next.js App Router, CSS Modules, Vitest + Testing Library.

## Global Constraints

- Purely visual. No API routes, data fetching, or component props change (other than the new
  `.noteWrapper` div in `notebook/page.tsx`, which changes markup, not behavior).
- Do not touch `src/app/components/QuizQuestion.tsx` or its `.questionCard` class in
  `session.module.css` — `notebook`'s accent is added via a new wrapper element around it, not by
  editing the shared component.
- Reuse existing CSS custom properties (`--accent`, `--notebook-accent`, `--essay-notes-accent`,
  `--quiz-practice-accent`) wherever already defined; add `--study-accent`/`--study-accent-bg`/
  `--study-accent-text` (not yet defined anywhere in this codebase) in Task 1.
- Route handlers aren't part of this plan — no route touched, no route test conventions apply.

---

### Task 1: `CoverScreen` nav card redesign

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/components/session.module.css:4-109`
- Modify: `src/app/components/CoverScreen.tsx`
- Modify: `src/app/components/CoverScreen.test.tsx`

**Interfaces:**
- Produces: `--study-accent: #2e9e6b`, `--study-accent-bg: #e7f6ef`, `--study-accent-text:
  #1c6b48` in `globals.css` — consumed by this task's own `.navLinkStudy` class and already
  referenced (but previously undefined) by `src/app/study/study.module.css`'s `.contentCard`,
  `.explanation`, `.explainButton`, `.practiceButton` classes from the earlier study-mode plan.

- [ ] **Step 1: Write the failing test**

Replace the whole contents of `src/app/components/CoverScreen.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoverScreen from './CoverScreen';
import type { BookRange } from './types';

const bookRanges: BookRange[] = [
  { bookId: 'b1', name: '문법', startPage: 11, endPage: 19 },
  { bookId: 'b2', name: '문학개론', startPage: 8, endPage: 14 },
];

describe('CoverScreen', () => {
  it('renders the title and each book range', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    expect(screen.getByText('오늘의 학습')).toBeInTheDocument();
    expect(screen.getByText(/문법 · 11~19p/)).toBeInTheDocument();
    expect(screen.getByText(/문학개론 · 8~14p/)).toBeInTheDocument();
  });

  it('calls onStart when the start nav card is clicked', async () => {
    const onStart = vi.fn();
    render(<CoverScreen bookRanges={bookRanges} onStart={onStart} />);

    const user = userEvent.setup();
    await user.click(screen.getByText(/오늘의 학습 시작하기/));

    expect(onStart).toHaveBeenCalled();
  });

  it('links to the wrong-answer notebook via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/오답노트/).closest('a');
    expect(link).toHaveAttribute('href', '/notebook');
  });

  it('links to the essay notebook via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/서술형 노트/).closest('a');
    expect(link).toHaveAttribute('href', '/essay-notes');
  });

  it('links to the quiz practice record via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/더 풀기/).closest('a');
    expect(link).toHaveAttribute('href', '/quiz-practice');
  });

  it('links to study mode via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/학습하기/).closest('a');
    expect(link).toHaveAttribute('href', '/study');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- CoverScreen`
Expected: FAIL — the "links to study mode" test fails because there's no `/study` link yet, and
`getByText(/오늘의 학습 시작하기/)` still finds the old button (that part alone would still pass) —
the meaningful new-behavior failure is the study-mode link test. Confirm it fails with "Unable to
find an element with the text: /학습하기/".

- [ ] **Step 3: Add the `--study-accent` CSS variables**

In `src/app/globals.css`, add these three lines right after the existing
`--quiz-practice-accent-text: #1f4d80;` line:

```css
  --study-accent: #2e9e6b;
  --study-accent-bg: #e7f6ef;
  --study-accent-text: #1c6b48;
```

- [ ] **Step 4: Replace the cover/tab CSS**

In `src/app/components/session.module.css`, change line 5 (`.cover`'s `position: relative;`) —
remove that line entirely (nothing else in `.cover` needs it once `.tabStack`'s
`position: absolute` is gone):

```css
.cover {
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}
```

Then replace the whole block from `.startButton` through the end of `.quizPracticeTab` (currently
lines 48-109) with:

```css
.navList {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 280px;
}

.navLink {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-radius: 14px;
  background: var(--card-background);
  border: 1px solid var(--card-border);
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  color: var(--foreground);
  transition: transform 0.1s ease;
}

.navLink:active {
  transform: scale(0.98);
}

.navLinkStart {
  border-left: 4px solid var(--accent);
}

.navLinkNotebook {
  border-left: 4px solid var(--notebook-accent);
}

.navLinkEssayNotes {
  border-left: 4px solid var(--essay-notes-accent);
}

.navLinkQuizPractice {
  border-left: 4px solid var(--quiz-practice-accent);
}

.navLinkStudy {
  border-left: 4px solid var(--study-accent);
}

.navLinkArrow {
  color: var(--text-secondary);
  font-size: 18px;
}
```

- [ ] **Step 5: Rewrite `CoverScreen.tsx`**

Replace the whole file with:

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
      <nav className={styles.navList}>
        <button className={`${styles.navLink} ${styles.navLinkStart}`} onClick={onStart}>
          오늘의 학습 시작하기 <span className={styles.navLinkArrow}>›</span>
        </button>
        <Link href="/notebook" className={`${styles.navLink} ${styles.navLinkNotebook}`}>
          오답노트 <span className={styles.navLinkArrow}>›</span>
        </Link>
        <Link href="/essay-notes" className={`${styles.navLink} ${styles.navLinkEssayNotes}`}>
          서술형 노트 <span className={styles.navLinkArrow}>›</span>
        </Link>
        <Link href="/quiz-practice" className={`${styles.navLink} ${styles.navLinkQuizPractice}`}>
          더 풀기 <span className={styles.navLinkArrow}>›</span>
        </Link>
        <Link href="/study" className={`${styles.navLink} ${styles.navLinkStudy}`}>
          학습하기 <span className={styles.navLinkArrow}>›</span>
        </Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- CoverScreen`
Expected: PASS (6 tests)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/app/components/session.module.css \
  src/app/components/CoverScreen.tsx src/app/components/CoverScreen.test.tsx
git commit -m "feat: replace cover screen's binder tabs with a flat nav card list"
```

---

### Task 2: List card accents (essay-notes, quiz-practice, study)

**Files:**
- Modify: `src/app/essay-notes/essay-notes.module.css:71-77`
- Modify: `src/app/quiz-practice/quiz-practice.module.css:21-27`
- Modify: `src/app/study/study.module.css:83-89`

**Interfaces:**
- Consumes: `--essay-notes-accent`, `--quiz-practice-accent` (already defined in `globals.css`),
  `--study-accent` (added in Task 1).

These are three isolated one-line CSS additions with no test impact — CSS module class
declarations aren't unit-tested anywhere in this codebase (confirmed by the existing test suites
for these three pages having no assertions on border/color styling). Verify visually in Step 4
instead of via a test file.

- [ ] **Step 1: Add the essay-notes accent**

In `src/app/essay-notes/essay-notes.module.css`, change:

```css
.noteCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}
```

to:

```css
.noteCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-left: 4px solid var(--essay-notes-accent);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}
```

- [ ] **Step 2: Add the quiz-practice accent**

In `src/app/quiz-practice/quiz-practice.module.css`, change:

```css
.noteCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}
```

to:

```css
.noteCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-left: 4px solid var(--quiz-practice-accent);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}
```

- [ ] **Step 3: Add the study accent**

In `src/app/study/study.module.css`, change:

```css
.contentCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 14px;
  margin-top: 12px;
}
```

to:

```css
.contentCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-left: 4px solid var(--study-accent);
  border-radius: 10px;
  padding: 14px;
  margin-top: 12px;
}
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test -- essay-notes quiz-practice src/app/study/page.test.tsx`
Expected: PASS, same counts as before this task (no test asserts on `border-left`, so nothing
should change) — this confirms the CSS edits didn't accidentally break any markup these tests
query against.

- [ ] **Step 5: Commit**

```bash
git add src/app/essay-notes/essay-notes.module.css src/app/quiz-practice/quiz-practice.module.css \
  src/app/study/study.module.css
git commit -m "feat: add colored left-border accent to essay-notes/quiz-practice/study cards"
```

---

### Task 3: 오답노트 card wrapper accent

**Files:**
- Modify: `src/app/notebook/page.tsx:99-117`
- Modify: `src/app/notebook/notebook.module.css`

**Interfaces:**
- Consumes: `--notebook-accent` (already defined in `globals.css`).
- Does not touch `QuizQuestion.tsx` or `session.module.css`'s `.questionCard`.

`notebook` has no per-item card class of its own — each wrong-answer question renders directly via
the shared `QuizQuestion` component. Add a new wrapper `div` around each rendered `QuizQuestion` in
the list, styled with the colored left border, rather than modifying the shared component (which
is also used, unaccented, by the daily session and by 학습하기's practice flow).

- [ ] **Step 1: Add the `.noteWrapper` class**

Append to `src/app/notebook/notebook.module.css`:

```css
.noteWrapper {
  border-left: 4px solid var(--notebook-accent);
  border-radius: 10px;
  margin-bottom: 12px;
}
```

- [ ] **Step 2: Wrap each rendered question**

In `src/app/notebook/page.tsx`, change:

```tsx
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
                attemptCount={overcomeOverrides[q.id] ? q.attemptCount + 1 : q.attemptCount}
                submitting={submitting[q.id] ?? false}
              />
            ))}
```

to:

```tsx
            {group.questions.map((q, i) => (
              <div key={q.id} className={styles.noteWrapper}>
                <QuizQuestion
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
                  attemptCount={overcomeOverrides[q.id] ? q.attemptCount + 1 : q.attemptCount}
                  submitting={submitting[q.id] ?? false}
                />
              </div>
            ))}
```

(Moving `key` from `QuizQuestion` to the new wrapping `div` — React needs the `key` on the
outermost element returned per list iteration.)

- [ ] **Step 3: Run the existing notebook tests to verify nothing broke**

Run: `npm test -- src/app/notebook/page.test.tsx`
Expected: PASS, same test count as before — the wrapper is presentation-only and doesn't change
any queryable text, role, or attribute the existing tests rely on.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/notebook/page.tsx src/app/notebook/notebook.module.css
git commit -m "feat: add colored left-border wrapper to 오답노트 question cards"
```

---

## After all tasks

1. Run the full suite: `npm test` and `npx tsc --noEmit` — confirm nothing else broke.
2. Manually verify in the browser: home screen shows 5 nav cards with distinct left-border colors
   and press-feedback on tap; 오답노트/서술형노트/더 풀기/학습하기 list cards each show their
   matching left-border color.
