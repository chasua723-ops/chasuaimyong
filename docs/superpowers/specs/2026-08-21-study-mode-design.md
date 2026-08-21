# 학습하기 (Study Mode) — Design

## Overview

A new on-demand study screen, separate from the daily 10-question session. The user picks a
subject (책), then a topic from that subject's table of contents, and sees the textbook content
for that topic plus an AI-generated explanation. From there they can jump straight into
topic-scoped practice questions. Modeled on the `/study` + `/quiz` pairing already built and
proven in the user's other app, `educational-theory-app`, adapted to this app's page-based content
model (no existing topic hierarchy).

Entered via a new "학습하기" tab on the cover screen, alongside the existing 오답노트/서술형
노트/더 풀기 tabs.

## Scope (v1)

- New route `/study`. All four books (문법, 교육학, 문학개론, 어학개론) are selectable.
- Topic hierarchy is derived from each book's real table-of-contents pages (confirmed present in
  all four source PDFs), not AI-guessed structure.
- Practice questions from a chosen topic are **quiz-type only** (grammar/vocab/reading/theory).
  Essay practice already has its own entry point (서술형 노트's "새 문제 풀기") and is out of
  scope here.
- No changes to any existing feature, table, or route. This is purely additive: one new table
  (`topics`), one new page, two new API routes, one ingestion script (run once per book).

## Data model

New table `topics`:

```sql
create table topics (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id),
  parent_id uuid references topics(id),
  name text not null,
  start_page int not null,
  end_page int not null,
  explanation text,
  created_at timestamptz not null default now()
);
```

- `start_page`/`end_page`: the page range this topic covers, derived from its TOC entry's page
  number through the page before the next same-or-shallower-level entry's page number (last topic
  in the book runs to the book's last page).
- `explanation`: nullable, populated lazily the first time the user views that topic (see API
  below) and reused on every later view — avoids re-calling the AI for a topic already explained.
  Textbook content never changes, so there's no cache-invalidation concern.
- `parent_id`: self-referencing, null for top-level chapters. **Two levels only** (대분류/소분류—
  chapter/section), matching what the ported dropdown UI (below) supports. If a book's real TOC
  goes deeper than two levels, flatten third-level-and-deeper entries into their nearest
  second-level (소분류) parent's page range rather than creating a third `topics` level — the
  dropdown has no representation for a third level, so a topic row nothing can select is dead
  data. Confirm each book's actual TOC depth during ingestion before deciding whether flattening is
  needed.

## Ingestion

One script, run once per book (`scripts/ingest-topics.ts <bookId>` or similar, following the
existing PDF-ingestion script conventions): parse the book's TOC page(s) into a name + page-number
tree, compute each node's `end_page` from the next sibling/parent's start page, and insert into
`topics`.

**Verification step (required before trusting the data):** after ingesting each book, spot-check a
handful of `start_page` values against `book_pages` — TOC page numbers sometimes drift from actual
`book_pages.page_num` because of front matter (표지, 서문, 목차 자체) that isn't counted the same
way in both places. Fix any offset before moving on to the next book.

## API

**`GET /api/topics?bookId=...`** → `{ topics: Topic[] }`, flat list for that book (client groups
into a tree for the dropdown, same as `educational-theory-app`'s `groupTopics` helper — port it
over rather than re-deriving).

**`GET /api/study/[topicId]`** → `{ topic: {...}, content: string, explanation: string | null }`.
Fetches the topic row, concatenates `book_pages` content for `[start_page, end_page]`, and returns
the cached `explanation` if present (null if never generated — client shows a "해설 보기" button
in that case, same UX as the reference app).

**`POST /api/study/[topicId]/explain`** → generates an explanation via the AI client (new
`explainTopic` function, same shape as the existing `explainAnswer`/`gradeEssay` helpers), saves it
to `topics.explanation`, and returns `{ explanation }`. A topic that already has a cached
explanation should not normally hit this route (the client only shows the button when
`explanation` is null), but the handler still overwrites+returns on repeat calls rather than
erroring, since that's simpler than a conflict check nobody will hit in a single-user app.

**`POST /api/study/[topicId]/practice`** → generates one quiz question scoped to that topic's page
range and inserts it exactly like the existing `/api/quiz-practice/new` does, via a new
`generateTopicPractice(supabase, aiClient, { topicId })` function that mirrors
`generateQuizPractice` but:
- looks up the topic (for `book_id`, `start_page`, `end_page`) instead of the book,
- calls `generateFromRandomPage` with `minPage: topic.start_page, maxPage: topic.end_page`
  instead of `maxPage: book.current_page`. This is a deliberate difference from 더 풀기: 학습하기
  practice is scoped to the chosen topic regardless of how far the user's daily pacing has
  actually progressed, since the whole point is studying a topic on demand.

Returns the same `{ id, type, prompt, choices, sourcePage }` shape as `/api/quiz-practice/new`.

Answering reuses the **existing, unchanged** `POST /api/attempts` — no new write path. Because the
question is inserted into the same `questions` table with `session_id: null` (same as 더 풀기
questions), it automatically shows up in 오답노트 and 더 풀기's history list if answered wrong or
right — no extra wiring needed.

## UI

- **Entry point**: `CoverScreen` gets a fourth tab, "학습하기" → `/study`, same visual treatment
  as the other three tabs.
- **`/study` page**:
  1. 과목 선택 — four buttons/select for 문법/교육학/문학개론/어학개론.
  2. 주제 선택 — a `<select>` with `<optgroup>` per top-level chapter and its children as
     options, populated from `GET /api/topics?bookId=...`. Ported UI pattern from
     `educational-theory-app`'s `study/page.tsx`.
  3. On selecting a topic: fetch `GET /api/study/[topicId]`, show the book content, and either the
     cached explanation or a "해설 보기" button that calls the explain endpoint.
  4. A "연습문제 풀기" button below the content, which calls
     `POST /api/study/[topicId]/practice` and renders the returned question with the existing
     `QuizQuestion` component, submitting through the existing `submitAnswer`-style flow (POST to
     `/api/attempts`). After answering, a "다른 문제 더 풀기" button requests another practice
     question for the same topic.
- Session-local state (selected book/topic/question) persists across a refresh the same way
  `educational-theory-app`'s `/study` and `/quiz` pages do (`loadDailySession`/`saveDailySession`
  helpers, ported over) — this app doesn't have that helper yet, so it needs to be added.

## Error handling

- Every fetch (`/api/topics`, `/api/study/[topicId]`, the explain/practice POSTs) follows the
  existing app-wide pattern: Korean error message, `console.error` the underlying error, no silent
  failure.
- If a book has no ingested topics yet (ingestion not run), `GET /api/topics` returns an empty
  list and the UI shows "아직 학습 콘텐츠가 준비되지 않았어요" instead of an empty dropdown.

## Testing

- `groupTopics` (ported helper): unit tests for tree-grouping, mirroring the reference app's
  existing tests.
- `generateTopicPractice`: unit test verifying it looks up the topic, calls
  `generateFromRandomPage` with the topic's own page range (not the book's `current_page`), and
  inserts the question with `session_id: null` — same mocking pattern as
  `generateQuizPractice.test.ts`.
- `explainTopic`: unit test verifying it returns and the route persists the result to
  `topics.explanation`.
- `/study` page: component tests for the book→topic selection flow, content display, cached vs.
  generated explanation, and the practice-question sub-flow (generate → answer → feedback →
  request another).
- `CoverScreen.test.tsx`: verify the new tab is present and points to `/study`.

## Out of scope (deferred)

- Essay-type practice from a topic (서술형 노트's existing flow already covers ad-hoc essay
  practice per book; topic-scoped essay practice can be added later following the same pattern if
  wanted).
- Progress tracking per topic (e.g., "이 주제 3번 복습함") — v1 is pure on-demand study, no
  spaced-repetition or completion tracking.
- Editing/re-ingesting topics from the UI — ingestion is a one-time script per book, rerun
  manually if a book's structure needs correcting.
