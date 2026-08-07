# 오늘의 학습 더 풀기 — Design

## Overview

The daily session gives each book exactly `QUESTIONS_PER_BOOK` (3) quiz questions, weighted across
grammar/vocab/reading/theory by `category_stats` accuracy, sourced only from that day's assigned
page slice (`assembleDailySession.ts`). Once a user finishes those 3, there's no way to practice
more without waiting for tomorrow's session. This adds a "더 풀기" button to each book section that
generates one additional quiz question on demand, sourced from the book's full covered range
(`[1, current_page]`) rather than just today's slice, plus a "더 풀기 기록" binder tab — a third
tab alongside 오답노트 and 서술형 노트 — where every on-demand practice attempt can be reviewed.

This follows the same on-demand pattern already shipped for 서술형 노트
(`2026-08-07-essay-grading-and-notebook-design.md`): a pure generation function paired with a thin
route, reusing the existing submission endpoint, plus a notes-list function paired with a thin
GET route.

## Scope (v1)

- Quiz-only (grammar/vocab/reading/theory). Essay practice already exists via 서술형 노트 and is
  untouched.
- The daily session's fixed 3-question-per-book quiz is not changed. This is purely additive.
- Randomizing the *daily* session's own quiz sourcing across the full covered range (rather than
  just the day's assigned slice) is a separate, still-deferred concern — not part of this spec.
  This spec only changes the sourcing range for *on-demand* practice questions.

## Adaptive type selection

`assembleDailySession.ts` currently defines `QUIZ_TYPES` and builds a weights record from
`category_stats` inline, local to that file. Both it and the new on-demand generator need the same
list, so `QUIZ_TYPES` moves to `src/lib/adaptive.ts` as an exported constant and
`assembleDailySession.ts` imports it instead of redefining it. This is a genuine shared constant
(two call sites, real drift risk if a type were added to one list and not the other), not a
premature abstraction.

`generateQuizPractice` reuses the existing `calculateWeights` / `pickWeightedTypes` functions from
`src/lib/adaptive.ts`, calling `pickWeightedTypes(weights, 1)[0]` to choose exactly one type —
same weighting logic as the daily session, just for a single question instead of three.

## On-demand quiz questions ("더 풀기")

New function `src/lib/quiz/generateQuizPractice.ts`:

```ts
export interface GenerateQuizPracticeInput {
  bookId: string;
}

export interface QuizPracticeQuestion {
  id: string;
  type: QuestionType; // grammar | vocab | reading | theory
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

Implementation:
1. Look up the book; throw `'Book not found'` if missing (matches `generateEssayPractice`).
2. Fetch `category_stats`, build weights for `QUIZ_TYPES`, pick one type via `pickWeightedTypes`.
3. Pick a random page in `[1, book.current_page]`; if that page has no `book_pages` row, retry once
   with a different random page before failing (same defensive retry as `generateEssayPractice`).
4. If the picked type is `'reading'`, fetch up to 2 reference excerpts
   (`reference_materials` where `name ilike '%독해%'`) the same way `assembleDailySession` does, so
   on-demand reading questions match the daily session's style grounding.
5. Call `generateQuestions` with `types: [type]` and the reference excerpts if applicable.
6. Insert one `questions` row with `session_id: null`, `used_reference` set to whether reference
   excerpts were used.
7. Return the new question's `id`/`type`/`prompt`/`choices`/`sourcePage`.

New route `POST /api/quiz-practice/new` → `{ bookId }` → `200 QuizPracticeQuestion` on success,
`500 { error }` on failure (Korean error message, same pattern as the essay route).

No new submission path: the client posts to the **existing** `POST /api/attempts` (`recordAttempt`)
endpoint, which already inserts into `attempts` and updates `category_stats` without caring whether
the question belongs to a `daily_sessions` row — verified by reading `recordAttempt.ts`, which looks
the question up by id only.

## Where the button lives and how answers flow

`BookSection` gets a `bookId: string` prop (currently missing — `page.tsx` has `range.bookId` but
never passes it down) and becomes self-contained for this feature: it owns local state for its own
practice questions (`QuizPracticeQuestion[]`), per-question feedback, and loading/error state. This
mirrors how `/essay-notes/page.tsx` manages its own practice flow independently of the main page's
state, rather than lifting an open-ended, book-scoped list into `page.tsx`'s `SessionData`-driven
state.

- "더 풀기" button renders after the day's fixed quiz questions and before the essay question,
  **always visible** (not gated on finishing the day's 3 questions).
- Clicking it calls `POST /api/quiz-practice/new` with the section's `bookId`, appends the returned
  question to local state, and renders it through the existing `QuizQuestion` component — same
  choice-button UI, numbered continuing from the daily questions.
- Submitting an answer posts to `POST /api/attempts` (same shape as `page.tsx`'s existing
  `submitAnswer`) and stores the result in local feedback state keyed by question id — reusing
  `QuizQuestion`'s existing `feedback` prop contract (`'correct' | { explanation, sourcePage }`).
- A user can click "더 풀기" repeatedly; each click appends another question to that book's list
  within the current page view.

## Reviewing past practice attempts

New function `src/lib/quiz/getQuizPracticeNotes.ts`:

```ts
export interface QuizPracticeNote {
  id: string; // attempt id
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

Fetches `attempts` joined with `questions` (in memory, same pattern as `getWrongNotes`/
`getEssayNotes`) filtered to questions where `session_id IS NULL AND type != 'essay'` — the marker
that distinguishes on-demand practice from daily-session questions (same trick `getEssayNotes` uses
via `concept_score IS NOT NULL`, just via the nullable-session-id column instead since quiz attempts
don't have a dedicated grading column). One row per **attempt**, not deduped by question — if a user
retries a question after getting it wrong, both attempts appear, newest first. This intentionally
does not dedupe/overcome-track like `getWrongNotes`; it's a full activity log of practice, not a
"still outstanding" view — that's what 오답노트 is for (and on-demand questions answered wrong
already surface there for free, since `getWrongNotes` doesn't filter by session either).

New route `GET /api/quiz-practice` → `{ notes: QuizPracticeNote[] }`.

## UI

- **Color**: a third accent, distinct from teal (main), orange (오답노트), and purple (서술형
  노트) — blue, `--quiz-practice-accent: #3b73b9` (tint `--quiz-practice-accent-bg: #e8f0fa` / text
  `#1f4d80`), added to `globals.css` alongside the existing accent sets.
- **Entry point**: `CoverScreen`'s `.tabStack` gets a third `Link`, "더 풀기 기록", filled with
  `--quiz-practice-accent`, appended after 서술형 노트. Because it's now the last tab instead of
  서술형 노트, the bottom-right border radius moves from `.essayNotesTab` to the new
  `.quizPracticeTab`; `.essayNotesTab` becomes square (middle tab).
- **`/quiz-practice` page**: flat list, newest first, of `QuizPracticeNote` cards — book name, type
  label (문법/어휘/독해/이론, same labels as `getWrongNotes`'s `TYPE_LABELS`), prompt (with `zh`
  class when Chinese), the user's answer, a correct/wrong badge, and source page. Read-only — no
  "새 문제 풀기" entry point here, since generation happens inline per-book on the main session
  page, not from this page (unlike 서술형 노트, which has no per-book inline button and so needs
  its own generation entry point).
- **`BookSection`** gets its own "더 풀기" button and inline question rendering, styled with
  `--quiz-practice-accent` to visually tie it to the record tab.

## Error handling

- `POST /api/quiz-practice/new` failure → inline Korean error message under the button, same
  pattern as the essay practice flow.
- `GET /api/quiz-practice` failure → same error-state pattern as `/notebook` and `/essay-notes`.
- Practice-answer submission reuses `POST /api/attempts` and its existing (already-accepted)
  handling — not touched by this change.

## Data model changes

None. `questions.session_id` is already nullable (migration `0002_essay_concept_grading.sql`), and
`attempts`/`category_stats` writes are already session-agnostic. No new migration.

## Testing

- `generateQuizPractice.test.ts`: adaptive type selection lands within `QUIZ_TYPES`, random page
  within `[1, current_page]`, retry-once-on-missing-page, reference excerpts fetched only for
  `reading`, `session_id: null` on the inserted question, throws on missing book.
- `getQuizPracticeNotes.test.ts`: only `session_id: null` non-essay questions appear, one row per
  attempt (retries produce two rows), sorted newest first.
- `BookSection.test.tsx`: existing tests updated with the new required `bookId` prop; new tests for
  the always-visible button, generating and appending a practice question (mocked fetch), and
  submitting a practice answer showing feedback.
- `CoverScreen.test.tsx`: verify the third tab links to `/quiz-practice`.
- `/quiz-practice` page component test: renders the notes list and the empty state.

## Out of scope (still deferred)

- Randomizing the *daily* session's own quiz sourcing across the full covered range instead of just
  the day's assigned page slice.
