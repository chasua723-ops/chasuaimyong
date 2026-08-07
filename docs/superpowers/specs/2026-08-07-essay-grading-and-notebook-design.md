# 서술형 채점 개편 + 서술형 노트 — Design

## Overview

The real 임용고시 exam scores each essay question out of 4 points by checking whether the
answer covers a fixed set of key concepts drawn from the source material — not a holistic
0–100 score. This redesigns essay grading to match that (AI extracts 4 key concepts from the
textbook excerpt, checks whether the Chinese answer covers each one, 1 point per concept), and
adds a dedicated "서술형 노트" (essay notebook) section — a binder tab alongside the existing
오답노트 — where every past essay attempt can be reviewed and new essay questions can be
requested on demand, independent of the daily session.

## Scope (v1)

- Essay grading only: `gradeEssay.ts`, `recordEssayAttempt.ts`, `EssayQuestion` feedback
  rendering, plus the new 서술형 노트 section.
- Two related but separate concerns are explicitly **out of scope**, to be brainstormed later:
  "더 풀기" (request more quiz questions once the daily set is exhausted) and randomizing quiz
  question sourcing across the full covered range instead of just the day's assigned pages.
- The daily session's one-per-day essay question is not removed — it continues to appear, now
  graded with the new system.

## Grading model

For a given essay question, `gradeEssay` is rewritten to:

1. Extract exactly 4 key concepts from the textbook excerpt that a complete answer should cover
   (the AI determines these from the source material and the question, not a fixed rubric authored
   ahead of time).
2. For each concept, judge whether the student's Chinese answer covers it (`covered: boolean`).
   `conceptScore` is the count of covered concepts (0–4) — this is the only number that counts as
   "the score," matching how the real exam works.
3. Independently, identify Chinese grammar/phrasing issues **sentence by sentence** in the
   answer and produce a corrected version of each flawed sentence with a short Korean explanation.
   Grammar issues never subtract from `conceptScore` — they are surfaced as prominent, dedicated
   feedback instead.

```ts
export interface ConceptCheck {
  concept: string;
  covered: boolean;
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

export interface EssayGradeResult {
  conceptScore: number; // 0-4
  conceptChecklist: ConceptCheck[]; // length 4
  grammarCorrections: GrammarCorrection[]; // empty array if no issues found
}
```

`gradeEssay`'s prompt asks Claude to return this shape as JSON, grounded in the same textbook
excerpt(s) already passed in today. The system prompt is updated to describe the concept-coverage
grading method explicitly instead of the old 0–100 dual-score instructions.

## Essay questions must be posed in Chinese

`generateQuestions.ts`'s prompt is shared across all question types today and doesn't say what
language an `essay`-type prompt should be written in. Real 임용고시 서술형 문제 are posed in
Chinese. Fix: when `types` includes `'essay'`, the prompt sent to Claude gets an explicit added
instruction that the `prompt` field for any essay-type question must be written in Chinese. This
applies to both the existing daily-session essay generation and the new on-demand generation
below — both call the same `generateQuestions` function.

## Data model changes

Two additive migrations (no destructive changes, existing rows untouched):

```sql
-- 0002_essay_concept_grading.sql
alter table attempts add column concept_score integer;
alter table attempts add column concept_checklist jsonb;
alter table attempts add column grammar_corrections jsonb;

alter table questions alter column session_id drop not null;
```

`content_score`/`chinese_score` columns stay (existing data preserved) but are no longer written
by new code — `recordEssayAttempt` writes to the three new columns instead.

`questions.session_id` becomes nullable because on-demand essay-notebook questions (see below)
aren't generated as part of any `daily_sessions` row.

## On-demand essay questions ("새 문제 풀기")

New function `src/lib/essay/generateEssayPractice.ts`:

```ts
export interface GenerateEssayPracticeInput {
  bookId: string;
}

export async function generateEssayPractice(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateEssayPracticeInput
): Promise<{ id: string; prompt: string; sourcePage: number }>
```

Implementation: look up the book, pick a random page in `[1, book.current_page]` (the range
already read, per the book's existing progress tracking), fetch that page's content, call
`generateQuestions` with `types: ['essay']`, insert one `questions` row with `session_id: null`,
return the new question's `id`/`prompt`/`source_page`. If the picked page has no `book_pages` row
(shouldn't happen given ingestion, but defensively) retry once with a different random page before
failing.

New route `POST /api/essay-notes/new` → `{ bookId }` → calls `generateEssayPractice`, returns the
new question. The client then reuses the **existing** `EssayQuestion` component and **existing**
`POST /api/attempts/essay` endpoint to answer and submit it — no new submission path.

## Reviewing past attempts

New function `src/lib/essay/getEssayNotes.ts`:

```ts
export interface EssayNote {
  id: string; // attempt id
  questionPrompt: string;
  bookName: string;
  koreanDraft: string;
  chineseAnswer: string;
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
  createdAt: string;
}

export async function getEssayNotes(supabase: SupabaseClient): Promise<EssayNote[]>
```

Fetches all `attempts` rows that have a non-null `concept_score` (i.e., essay attempts graded
under the new system), joined with their `questions` and `books` in memory (same pattern as
`getWrongNotes`), sorted newest first. No filtering by score — every submitted essay attempt
appears, per the user's explicit choice.

New route `GET /api/essay-notes` → `{ notes: EssayNote[] }`.

## UI

- **Color**: a new accent distinct from both the main teal and 오답노트's orange — purple,
  `--essay-notes-accent: #7c6bb0` (with tint `--essay-notes-accent-bg: #f0eef8` / text
  `#4f4380` for badges), added to `globals.css` alongside the existing `--notebook-accent` set.
- **Entry point**: `CoverScreen` gets a second vertical tab, "서술형 노트", filled with
  `--essay-notes-accent`, positioned below/adjacent to the existing 오답노트 tab. Links to
  `/essay-notes`.
- **`/essay-notes` page**:
  - "새 문제 풀기" button at the top. Clicking shows a book-choice list (문법/문학개론/어학개론,
    from `books`). Choosing one calls `POST /api/essay-notes/new`, then renders the returned
    question through `EssayQuestion` for the two-stage answer flow, submitting through the
    existing essay-attempt endpoint.
  - Below that, "지난 답안" — every entry from `GET /api/essay-notes`, newest first: question
    prompt, book name, date, the 4-item concept checklist (✓/✗ per concept), total score (N/4).
  - A "채점 중..." loading state covers the gap between submitting an answer and the graded
    result coming back (this call can take several seconds to tens of seconds).
- **`EssayQuestion` feedback rendering** changes from the old two-number display
  (`내용 정확도 80점 / 중국어 표현 60점 — ...`) to: the 4-item concept checklist, the `N/4` total,
  and a list of grammar corrections (each showing the original sentence, the corrected version,
  and the short explanation) when `grammarCorrections` is non-empty.

## Error handling

- `POST /api/essay-notes/new` failure → Korean error message in the book-picker flow, same
  pattern as the rest of the app.
- `GET /api/essay-notes` failure → same error-state pattern as `/notebook`.
- Essay submission itself reuses the existing `/api/attempts/essay` endpoint and its existing
  (already-accepted) lack of `res.ok` handling — not touched by this change.

## Testing

- `gradeEssay.test.ts`: rewritten for the new prompt/return shape — concept checklist length,
  score-equals-covered-count, grammar corrections array shape.
- `recordEssayAttempt.test.ts`: updated to assert the three new columns are written.
- `EssayQuestion.test.tsx`: updated feedback-rendering tests for the checklist + corrections UI;
  old two-score assertions removed.
- `generateEssayPractice.test.ts`: covers random-page selection within `[1, current_page]`,
  `session_id: null` on the inserted question, and the retry-once-on-missing-page path.
- `getEssayNotes.test.ts`: covers the join/shape and the "no score filtering" behavior (an attempt
  with `conceptScore: 0` still appears).
- `/essay-notes` page component test: renders the notes list, exercises the new-question flow
  (book picker → question appears → answer → submit → graded result shown), and the loading state.
- `CoverScreen.test.tsx`: verify the new tab link is present and points to `/essay-notes`.

## Out of scope (deferred)

- "더 풀기" for the daily quiz session once today's questions are exhausted (grammar/vocab/reading/
  theory) — separate brainstorm.
- Randomizing quiz question sourcing across the full covered range instead of just the day's
  assigned page slice, for better retrieval practice — separate brainstorm.
