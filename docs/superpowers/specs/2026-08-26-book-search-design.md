# 검색 (Book Search) — Design

## Overview

A new "검색" entry point where the user types a free-text query, gets matching excerpts from all
four textbooks plus an AI answer grounded in those excerpts, and can keep asking follow-up
questions in the same thread — every answer grounded only in the matched textbook content, never
fabricated, matching the grounding discipline already used everywhere else in this app
(`explainAnswer`, `explainTopic`, `gradeEssay`).

## Scope (v1)

- Searches `book_pages` across all four books at once (문법/교육학/문학개론/어학개론) — no
  book-first picker, unlike 학습하기's flow.
- Keyword matching only (`ilike`), not AI semantic search — matches the existing pattern already
  used for reference-material matching elsewhere in this codebase. AI is only used to *synthesize*
  an answer from the matched excerpts, not to do the matching itself.
- Follow-up questions reuse the same page/thread: each follow-up re-searches with its own query
  text and answers with the prior Q&A history as context, so the thread reads as one continuous
  conversation instead of disconnected one-off searches.
- New "검색" nav card on the home screen and its own accent color, extending the pattern the
  nav-card-redesign plan already established (colored left border per feature).
- No changes to any existing table, route, or feature.

## Data flow

**New table? No.** Reuses `book_pages` and `books` directly — no new schema.

**Matching** (`src/lib/search/searchBookPages.ts`): `ilike` match on `book_pages.content` across
all books, capped at `MAX_MATCHES = 30` rows (ordered by `book_id, page_num` so results read in a
stable, book-grouped order), each joined to its book's name. Returns
`{ bookId, bookName, pageNum, content }[]`.

**Answering** (`src/lib/ai/answerSearchQuery.ts`): takes the search query, the matched excerpts
(capped further to `MAX_EXCERPTS_FOR_AI = 10` — the first 10 of the already-ordered match list,
to bound prompt size/cost even when a common term matches many pages), and an optional prior
Q&A `history: { question: string; answer: string }[]` for follow-ups. Builds one prompt containing
all of that and asks Claude (via `askClaude`, matching every other AI call in this codebase) to
answer using only the given excerpts, extending the same "explain each concept's actual content,
no fixed sentence cap, `maxTokens: 2000`" fix already applied to `explainTopic` after the
sibling-project bug (see `src/lib/ai/explainTopic.ts` for the reference pattern) — this function's
system prompt follows it exactly rather than reintroducing a sentence cap.

**Orchestration** (`src/lib/search/runSearch.ts`): calls `searchBookPages` then
`answerSearchQuery`, returns `{ answer: string, matches: Match[] }`. One function serves both the
initial search (no `history`) and every follow-up (with `history`) — the only difference is
whether the caller passes prior turns.

## API

**`POST /api/search`** → body `{ query: string, history?: { question: string; answer: string }[] }`
→ `{ answer: string, matches: { bookId, bookName, pageNum, content }[] }`. Used for both the
initial search and every follow-up; the client sends its accumulated `history` on follow-ups.

If `searchBookPages` finds zero matches, the route returns `{ answer: '', matches: [] }` rather
than calling the AI at all (an empty-excerpts AI call is exactly the bug already fixed in
`getOrGenerateExplanation` — this function must never make that mistake either). The client
renders "검색 결과가 없어요" whenever `matches.length === 0`.

## UI

New page `src/app/search/page.tsx`:

1. A search input + submit button at the top (plus a "‹ 홈" back link, matching every other
   page's header).
2. On submit: `POST /api/search` with `{ query }`, no history (first turn).
3. Empty state: "검색 결과가 없어요." when `matches.length === 0`.
4. Result state: an AI-answer card (accent-colored left border, same visual language as 학습하기's
   해설 card) showing `answer`, followed by the raw excerpts — grouped under each book's name,
   each excerpt showing its page number and content (Chinese excerpts get the existing
   `containsChinese` → `zh` font-class treatment already used throughout the app).
5. Below the results, a follow-up input box. Submitting it calls `POST /api/search` again with
   the new query and the accumulated `history` (every prior `{question, answer}` pair in this
   thread, oldest first). The new turn's question and answer are appended and rendered as a
   running thread — each turn shows its own answer card and its own matched excerpts, so earlier
   turns' grounding stays visible as the conversation continues.
6. The top search box from step 1 stays visible above the results and remains usable throughout —
   submitting *it* always starts a brand new thread (clears `history` and any rendered turns) and
   runs a fresh initial search. The follow-up box in step 5 is a separate, second input that only
   ever appends to the current thread. These are two distinct inputs, not one box that behaves
   differently depending on state.

## Home screen integration

Add a sixth nav card to `CoverScreen.tsx`: "검색" → `/search`, with a new `--search-accent`
CSS custom property (following the exact pattern `--study-accent` was added in) alongside the
existing five cards. No other change to the nav-card redesign's markup/CSS structure.

## Error handling

Same pattern as every other page in this app: fetch failure → Korean error message +
`console.error`, no silent failure. No `maxDuration` override needed beyond the Next.js default,
since a single `askClaude` call with 10 short excerpts is well within normal response time (same
order of magnitude as `explainTopic`, which has no override either).

## Testing

- `searchBookPages.test.ts`: matches across multiple books, respects the `MAX_MATCHES` cap, joins
  book names correctly, returns an empty array for no matches — using `createMockSupabase`.
- `answerSearchQuery.test.ts`: prompt contains the query and the excerpt content (mocked AI
  client, same pattern as `explainTopic.test.ts`); a second test confirms `history` turns are
  included in the prompt when provided.
- `runSearch.test.ts`: orchestrates the two functions correctly; confirms the AI is never called
  when there are zero matches (mirroring the regression test already added for
  `getOrGenerateExplanation`).
- `/search` page component test: initial search → answer + grouped excerpts render; empty state;
  follow-up appends a second turn to the thread; error state on a failed fetch.
- `CoverScreen.test.tsx`: one more test for the new "검색" nav card, following the existing pattern
  for the other five.

## Out of scope (deferred)

- AI semantic/embedding-based search — keyword `ilike` only for v1.
- Searching `reference_materials` (기출문제) — explicitly book-content-only, per "책에 근거해서".
- Persisting search history across sessions (each visit to `/search` starts fresh; no new table
  for saved searches).
- Highlighting the matched keyword within each excerpt — excerpts render as plain page content,
  same as 학습하기's content view.
