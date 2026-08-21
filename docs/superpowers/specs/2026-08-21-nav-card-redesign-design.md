# 홈 화면 & 카드 스타일 리디자인 — Design

## Overview

Replace the home screen's single-CTA-plus-sideways-binder-tabs layout with a flat, equal-weight
card list (modeled on `educational-theory-app`'s home screen, which the user prefers), and extend
that same "colored left-border card" visual language to the list cards on 오답노트/서술형
노트/더 풀기/학습하기 so every list in the app reads consistently. Purely visual — no data,
routing, or business-logic changes.

## Motivation

Compared side-by-side with `educational-theory-app` (same design-token base — both apps already
share `--accent`, `--notebook-accent`, `--essay-notes-accent`, `--quiz-practice-accent`, and now
`--study-accent`), the difference isn't color, it's layout:

- **Home screen:** `educational-theory-app` presents all 5 features as equal-weight, easy-to-tap
  cards in one vertical list. This app currently has one big "오늘의 학습 시작하기" button plus
  four unrelated features crammed into 12px-wide sideways text tabs stuck off the right edge of
  the screen — small, hard to tap, and not scannable at a glance.
- **List cards:** `educational-theory-app`'s cards (home nav, 오답노트) all carry a
  `border-left: 4px solid <feature accent color>`, so which section a card belongs to is visible
  instantly. This app's equivalent cards (오답노트, 서술형노트, 더 풀기, and the new 학습하기) have
  no such marker — same plain `border: 1px solid var(--card-border)` regardless of section.

## Scope

- `CoverScreen.tsx` and its styles: replace the `.startButton` + `.tabStack` (sideways binder
  tabs) with one flat nav card list. This **supersedes** the pending "학습하기 tab" task from the
  study-mode plan (Task 12 there) — that task added 학습하기 as a fifth sideways tab, which no
  longer exists after this change. Task 12 is marked superseded in that plan's ledger once this
  spec is approved; 학습하기's entry point is instead one of the five cards built here from the
  start.
- Card left-border accent added to: `essay-notes`'s `.noteCard`, `quiz-practice`'s `.noteCard`,
  `study`'s `.contentCard`, and a new wrapper around each entry in `notebook`'s list (see below —
  `notebook` doesn't have its own per-item card class, it reuses the shared `QuizQuestion`
  component, which this spec deliberately does not touch).
- Everything else — question/essay answering screens, the timer, vocab card, all API routes, all
  data logic — unchanged.

## Home screen

`CoverScreen.tsx` keeps its existing top block (`.coverDate`, `.coverTitle`, `.coverRanges` — the
date + "오늘의 학습" heading + today's page ranges) unchanged. Below that, replace the
`.startButton` and `.tabStack`/`.notebookTab`/`.essayNotesTab`/`.quizPracticeTab` block with one
`<nav>` of 5 cards, first one triggering the existing `onStart` callback (still a `<button>`, not
a `<Link>`, since it has no route of its own), the rest unchanged `<Link>`s to their existing
routes:

```tsx
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
```

CSS (new classes in `session.module.css`, replacing `.startButton`/`.tabStack`/`.notebookTab`/
`.essayNotesTab`/`.quizPracticeTab` — those four are deleted, not deprecated-in-place):

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

`.cover`'s existing `position: relative` was only needed to anchor `.tabStack`'s
`position: absolute; right: -20px`, which is now gone — drop `position: relative` from `.cover`
too (no other rule in that class depends on it).

## List card accents

Add one line to each of these three existing classes (no other change):

- `src/app/essay-notes/essay-notes.module.css`'s `.noteCard`: `border-left: 4px solid var(--essay-notes-accent);`
- `src/app/quiz-practice/quiz-practice.module.css`'s `.noteCard`: `border-left: 4px solid var(--quiz-practice-accent);`
- `src/app/study/study.module.css`'s `.contentCard`: `border-left: 4px solid var(--study-accent);`

`notebook` has no per-item card wrapper today — each wrong-answer question renders directly via
the shared `QuizQuestion` component (used identically by the daily session and 학습하기's practice
flow, neither of which should get a notebook-orange border). Do not touch `QuizQuestion.tsx` or
`session.module.css`'s `.questionCard`. Instead, wrap each item in `notebook/page.tsx`'s own render
loop in a new local wrapper div styled in `notebook.module.css`:

```tsx
{group.questions.map((q, i) => (
  <div key={q.id} className={styles.noteWrapper}>
    <QuizQuestion ... />
  </div>
))}
```

```css
.noteWrapper {
  border-left: 4px solid var(--notebook-accent);
  border-radius: 10px;
  margin-bottom: 12px;
}
```

`QuizQuestion`'s own `.questionCard` already has `border-radius: 10px` and `margin-bottom: 12px`.
Leave both as-is inside the new wrapper — the wrapper adds only the colored left edge around the
existing card, it doesn't need to take over spacing or rounding from it. The visual result is one
continuous rounded card with a colored left edge, which is what's wanted. No changes to
`QuizQuestion.tsx` needed.

## Testing

- `CoverScreen.test.tsx`: replace the three existing "links to X via a binder tab" tests (and
  drop the "calls onStart when the start button is clicked" test's now-stale button-text
  assumption if the button text changes — it doesn't here, `onStart` is still wired to a clicked
  element with the same accessible text) with equivalent assertions against the new nav cards:
  each of the 4 `Link`s still resolves to the same `href`, and clicking the "오늘의 학습 시작하기"
  nav item still calls `onStart`. No new test file — same file, updated to match the new markup.
- `notebook/page.test.tsx`: no behavioral change (the wrapper is presentation-only), so existing
  tests should keep passing unmodified; only add a check if one doesn't already exist that a
  wrong-answer item's container carries the new wrapper class — optional, low value, skip unless
  it's already trivial to add.
- No test needed for the three one-line CSS additions (`essay-notes`, `quiz-practice`, `study`) —
  CSS module class additions aren't unit-tested anywhere in this codebase.

## Out of scope

- Restyling the actual question/essay-answering screens, timer, or vocab card.
- Any change to `QuizQuestion.tsx` or `session.module.css`'s shared `.questionCard`.
- Extending the accent-per-section convention into 학습하기's own topic-detail sub-views beyond
  the one `.contentCard` border already covered above.
