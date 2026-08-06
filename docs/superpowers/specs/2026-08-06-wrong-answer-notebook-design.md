# 오답노트 (Wrong Answer Notebook) — Design

## Overview

A review screen that surfaces every quiz question the user has ever gotten wrong, grouped by
question type, so recurring weak spots are easy to revisit outside the daily 15-minute session.
Entered via a binder-style tab on the cover screen. Wrong questions can be re-attempted in place;
once answered correctly they're marked "극복됨" (overcome) but stay visible for a sense of progress.

## Scope (v1)

- **Quiz questions only** (`grammar`, `vocab`, `reading`, `theory`). Essay questions are explicitly
  out of scope — essay grading currently scores 0–100 while the real exam scores 4 points per
  question, and there's no structured grammar-correction feedback yet. Both of those are real gaps,
  but they're an essay-grading improvement, not a notebook feature, and will be scoped separately.
- No new tables. Status is derived entirely from existing `questions` + `attempts` data.

## Status derivation

For a given quiz question, look at all its `attempts` ordered by `created_at`:

- **Never wrong**: no attempt with `is_correct = false` → question never appears in the notebook.
- **미해결 (outstanding)**: the most recent attempt has `is_correct = false`.
- **극복됨 (overcome)**: the most recent attempt has `is_correct = true`, and at least one earlier
  attempt on the same question had `is_correct = false`.

A question only enters the notebook once it has been gotten wrong at least once; getting it right
on the first try never surfaces it.

## Data layer

New function `src/lib/notebook/getWrongNotes.ts`:

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
  type: QuestionType; // grammar | vocab | reading | theory
  label: string; // 문법 | 어휘 | 독해 | 이론
  outstandingCount: number;
  totalCount: number; // outstanding + overcome
  questions: WrongNoteQuestion[];
}

export async function getWrongNotes(supabase: SupabaseClient): Promise<WrongNoteGroup[]>
```

Implementation: fetch quiz-type `questions` joined with their `attempts` and `books.name`, group in
memory by `question_id` to determine each question's latest/earliest attempt status, then bucket by
`type`. Groups with zero wrong-ever questions are omitted from the response entirely (no empty
sections).

## API

`GET /api/notebook` → `{ groups: WrongNoteGroup[] }`, calling `getWrongNotes`.

Re-attempting a question reuses the **existing** `POST /api/attempts` (`{ questionId, userAnswer }`)
unchanged — no new write endpoint. The client optimistically flips that question to
`overcome: true` on a correct response.

## UI

- **Color**: the notebook gets its own accent, distinct from the main teal (`--accent`), to read as
  a different "binder tab" section — a bright orange, new CSS variable `--notebook-accent: #f4832b`
  (with a paired light tint `--notebook-accent-bg: #fef1e2` / text-on-tint `#b5590a` for badges).
- **Entry point**: `CoverScreen` gets a vertical "오답노트" tab fixed to the right edge, filled with
  `--notebook-accent`, styled as part of the existing binder/notebook aesthetic. Clicking navigates
  to a new route `/notebook` (plain link — no client-side state machine needed since it's a separate
  page).
- **`/notebook` page**: fetches `GET /api/notebook` on mount. Renders one section per group:
  - Header: `{label} {outstandingCount}/{totalCount} 미해결 ({percentage}%)`, the count badge styled
    with `--notebook-accent-bg`/`--notebook-accent` text.
  - Each question rendered with the **existing `QuizQuestion` component** (already takes
    `question`, `index`, `feedback`, `onSubmit` — no changes needed for outstanding questions).
    Reading (`reading`) questions carry their full source passage inside `question.prompt` already
    (see `generateQuestions.ts` — passage and question are one generated string), so those cards
    will render noticeably taller than grammar/vocab/theory cards. This is expected — no truncation
    or collapse in v1.
    Overcome questions render the same component but visually muted (reduced opacity) with an
    "극복됨" badge (`--notebook-accent-bg`/`--notebook-accent` text), and are not resubmittable.
  - Submitting a wrong-notes question calls the same `submitAnswer` logic already used on the
    session page (POST to `/api/attempts`, show `QuizFeedback` inline).
- **Empty state**: if `groups` is empty, show "아직 오답이 없어요 🎉".

## Error handling

- `/api/notebook` fetch failure → same pattern as the existing session page: show a Korean error
  message, no silent failure.
- Re-attempt submission failure → existing `/api/attempts` error handling already covers this path;
  no new handling needed since it's the same endpoint.

## Testing

- `getWrongNotes.test.ts`: unit tests covering status derivation (never-wrong excluded,
  outstanding vs overcome classification, grouping, count math) against a mocked Supabase client —
  following the same mocking pattern as `recordAttempt.test.ts`.
- `route.test.ts` for `/api/notebook`: verifies the handler calls `getWrongNotes` and returns its
  result as JSON.
- Component test for the notebook page: renders groups, verifies overcome questions are muted and
  not resubmittable, verifies empty state.
- `CoverScreen.test.tsx`: verify the new tab link is present and points to `/notebook`.

## Out of scope (deferred)

- Essay question review (score-based, tied to the 4-point rescoring + grammar-correction work).
- Spaced-repetition scheduling of overcome questions.
- Manual deletion/dismissal of notebook entries.
