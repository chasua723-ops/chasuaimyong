# 검색 결과 없을 때 대안(참고자료 추가 / AI 일반지식) — Design

## Overview

When 검색 finds nothing in the textbooks, give the user two opt-in ways forward instead of a dead
end: paste in their own reference material (saved permanently, searched alongside the textbooks
from then on) or ask the AI to answer from its general knowledge (never saved, always visibly
marked as not textbook-grounded). Neither happens automatically — both require an explicit click,
preserving this app's "grounded unless the user explicitly asks otherwise" trust model.

## Motivation

Every AI feature built so far in this app is grounded strictly in textbook content and refuses to
answer past what it's given. That's the right default for exam prep, but it means a genuine "not
covered" or "my search term didn't match the book's wording" dead-ends the user with nothing. Two
real, distinct problems came up during brainstorming:

1. The current "검색 결과가 없어요" search is a literal keyword match (`ilike`) — a topic can be
   in the book under different wording and still show zero results. The empty state should say so
   honestly, not imply the topic itself is absent.
2. Sometimes the topic genuinely isn't in any of the four textbooks. For that case, the safest
   answer to "can the AI find authoritative material" is: this app has no live web search or
   source-verification capability, so an AI general-knowledge answer can be *more careful*, but
   never *verified*. The user pasting in material they already trust sidesteps that limitation
   entirely — the app doesn't need to judge authority, the user already did.

## Scope (v1)

- Triggered only from 검색's empty-result state (both zero textbook matches and zero saved
  reference matches) — not from 학습하기 or any other feature.
- Two independent actions, both opt-in via a button click: "자료 붙여넣기" (paste material,
  saved permanently and searched from then on) and "그래도 AI한테 물어볼까요?" (one-off,
  never-saved general-knowledge answer, always shown with a persistent warning).
- No UI to browse, edit, or delete previously saved reference material in v1 — it's write-once
  from the paste flow, read-only via search from then on.
- No book association for saved reference material — it's searched across all four books' worth
  of context, same as 검색 already is.

## Data model

New table `user_references` (no `book_id` — deliberately book-agnostic, matching 검색's own
all-books scope):

```sql
create table user_references (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  content text not null,
  created_at timestamptz not null default now()
);
```

`query` records what search term prompted the addition — useful context if this ever gets a
management UI later, not used by search matching itself (matching is purely against `content`,
same `ilike` approach as `book_pages`).

## Search integration

New `searchUserReferences(supabase, query): Promise<UserReferenceMatch[]>` mirrors
`searchBookPages` exactly (same `ilike`-on-`content`, same client-side sort-then-cap pattern,
same escaped-wildcard handling) but against `user_references`, returning
`{ id: string; content: string }[]`.

`runSearch` (already built) is extended to call both `searchBookPages` and
`searchUserReferences`, and its zero-match guard now checks both: the AI is skipped only when
*neither* source found anything. Its result gains a second field,
`userMatches: UserReferenceMatch[]`, alongside the existing `matches: SearchMatch[]` — the two
stay separate so the UI can show "교재 원문" and "내가 추가한 자료" as visually distinct
sections, never blended into one unlabeled list.

`answerSearchQuery`'s excerpt shape changes from book-specific fields to a generic label, since it
now grounds answers in either source:

```ts
// before: SearchExcerpt { bookName: string; pageNum: number; content: string }
// after:
export interface SearchExcerpt {
  label: string; // e.g. "문법 10페이지" or "내가 추가한 자료"
  content: string;
}
```

`runSearch` builds each excerpt's `label` at the call site (`"${bookName} ${pageNum}페이지"` for
book matches, the literal string `"내가 추가한 자료"` for user matches), combines both lists, and
caps the combined total at the existing `MAX_EXCERPTS_FOR_AI` before calling `answerSearchQuery`.

## The two fallback actions

**"자료 붙여넣기"** — `POST /api/search/reference`, body `{ query, content, history? }`:
1. Inserts `{ query, content }` into `user_references`.
2. Answers immediately using only that pasted content as the excerpt (via the same
   `answerSearchQuery`, one excerpt: `{ label: '내가 추가한 자료', content }`) — no need to
   re-run the search, the content just came from the user's own hands.
3. Returns `{ answer: string; userMatches: [{ id, content }] }`, same shape 검색 already uses, so
   the client renders it identically to a normal grounded result — no special-casing needed once
   this response lands.
4. From this point on, that content is part of `user_references` and surfaces in *every* future
   검색 (including someone else's search for a different but overlapping term, since matching is
   plain keyword `ilike`, same as everything else here).

**"그래도 AI한테 물어볼까요?"** — `POST /api/search/general`, body `{ query, history? }`:
1. Calls a new `answerGeneralQuery(client, { query, history })` — no excerpts at all, a
   deliberately different system prompt (see below), same `maxTokens: 2000` / no-sentence-cap
   discipline as every other AI function in this app.
2. Returns `{ answer: string }` only — nothing is ever persisted from this path.
3. The client marks that turn `ungrounded: true` and renders it with a distinct warning style
   (not the normal `--search-accent` card) plus fixed text: "⚠️ 이 답변은 교재 내용이 아니라 AI의
   일반 지식이에요. 정확하지 않을 수 있어요." — this label is not dismissible and doesn't fade;
   it stays on that turn's card for as long as the turn is visible.

`answerGeneralQuery`'s system prompt drops the "only use given excerpts" constraint (there are
none to use) but keeps every other established discipline: no sentence-count cap, 간체자-only
Chinese quoting, and adds an explicit instruction to stick to widely-established facts and say so
plainly when something is uncertain rather than guessing — the closest this app can get to
"careful" without any real source-verification capability, which this spec is explicit does not
exist here (no web search, no external authority check — see Motivation).

## UI

Only the **most recent** turn can ever show the two fallback buttons — once a newer turn is
appended (a fresh top-level search or another follow-up), any earlier empty turn stops being
interactive and just displays its final state (still "no results", a saved reference's answer, or
an ungrounded answer, whichever it ended up as). This keeps the per-turn interactive state to a
single paste-textarea-open flag and its text, not a state map keyed by turn index.

Empty-result rendering (last turn only, before either action is taken):
```
"{question}"로는 못 찾았어요.
[자료 붙여넣기]   [그래도 AI한테 물어볼까요?]
```

Clicking "자료 붙여넣기" reveals a textarea + submit button in place of the two buttons; on
submit, the turn updates in place (same index, not a new turn) with the returned answer and
`userMatches`, rendered exactly like a normal grounded result with a "내가 추가한 자료" section
label above the excerpt (as opposed to the existing "교재 원문"-style unlabeled list, which stays
unlabeled since it only ever contains book excerpts).

Clicking "그래도 AI한테 물어볼까요?" updates the same turn in place with the ungrounded answer and
warning card described above.

## Error handling

Same pattern as the rest of this app: fetch failure → Korean error message + `console.error`, no
silent failure. `POST /api/search/reference` rejects an empty/whitespace `content` the same way
`POST /api/search` already rejects an empty `query` (400, no DB write, no AI call).

## Testing

- `searchUserReferences.test.ts`: mirrors `searchBookPages.test.ts` — matches, empty results, cap,
  wildcard escaping.
- A new test for the write path (`saveUserReference` or equivalent) confirming the insert shape.
- `answerSearchQuery.test.ts`: update existing tests for the `label`-based `SearchExcerpt` shape;
  no new test needed beyond that migration.
- `answerGeneralQuery.test.ts`: prompt contains the query and (when given) prior history; no
  excerpts-related assertions since there are none; confirms `maxTokens: 2000` and no sentence cap
  in the system prompt text.
- `runSearch.test.ts`: update for the two-source zero-match guard (AI skipped only when both
  `searchBookPages` and `searchUserReferences` return empty) and the combined, capped, labeled
  excerpt list passed to `answerSearchQuery`.
- `/search` page test: paste-and-save flow renders the new answer + "내가 추가한 자료" section;
  general-knowledge flow renders the warning card with the fixed disclaimer text; confirms an
  older (non-latest) empty turn no longer shows either button once a new turn is appended.

## Out of scope (deferred)

- Any UI to view, search, edit, or delete previously saved `user_references` rows directly.
- Associating a saved reference with a specific book.
- Any real external-source verification (web search, citation checking) for the general-knowledge
  path — explicitly not attempted; the warning label is the only safeguard this version has.
- Applying either fallback to 학습하기 or any feature other than 검색.
