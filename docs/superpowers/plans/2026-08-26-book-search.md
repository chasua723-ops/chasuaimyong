# 검색 (Book Search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "검색" feature — free-text keyword search across all four textbooks, returning an
AI answer grounded in the matched excerpts plus the raw excerpts themselves, with follow-up
questions continuing the same thread.

**Architecture:** A pure DB-matching function (`searchBookPages`) finds `book_pages` rows via
`ilike`; an AI function (`answerSearchQuery`) synthesizes a grounded answer from the matches (and
optional prior Q&A history); a thin orchestration function (`runSearch`) wires the two together
and is reused for both the initial search and every follow-up. One new page, one new API route, no
new tables.

**Tech Stack:** Next.js App Router, Supabase (Postgres), Anthropic Claude API via
`src/lib/ai/client.ts`, Vitest + Testing Library.

## Global Constraints

- Purely additive — no existing table, route, or component's behavior changes (this plan adds one
  new nav card to `CoverScreen`, which is additive to that file, not a behavior change to any of
  its existing 5 cards).
- All AI calls go through `askClaude`/`parseJsonResponse` in `src/lib/ai/client.ts` — never call
  `client.messages.create` directly from a new file.
- Any Chinese text an AI system prompt constrains must be 简体字 only, never 繁體字 — carry this
  into `answerSearchQuery`'s system prompt, matching `explainTopic.ts`.
- `answerSearchQuery`'s prompt must NOT contain a fixed sentence-count cap (e.g. "N~M문장 이내로").
  This app hit a real, already-diagnosed bug from exactly that pattern (see
  `src/lib/ai/explainTopic.ts`'s comment and commit history) — the fixed prompt/system text and
  `maxTokens: 2000` given in Task 2 below already avoids it; do not reintroduce a cap.
- The AI must never be called with zero matched excerpts — `runSearch` (Task 3) returns
  `{ answer: '', matches: [] }` without calling `answerSearchQuery` at all when there are no
  matches, mirroring the fix already applied to `getOrGenerateExplanation` for the same class of
  bug (an AI call with no grounding content produces a refusal that must never be treated as a
  real answer).
- Route handlers are not unit-tested anywhere in this codebase — no test file for the new route.
- Mock Supabase in tests via `tests/helpers/mockSupabase.ts`'s `createMockSupabase`.

---

### Task 1: `searchBookPages`

**Files:**
- Create: `src/lib/search/searchBookPages.ts`
- Test: `src/lib/search/searchBookPages.test.ts`

**Interfaces:**
- Produces: `SearchMatch { bookId: string; bookName: string; pageNum: number; content: string }`,
  `searchBookPages(supabase: SupabaseClient, query: string): Promise<SearchMatch[]>` — consumed by
  Task 3.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/search/searchBookPages.test.ts
import { describe, it, expect } from 'vitest';
import { searchBookPages } from './searchBookPages';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [
      { id: 'b1', name: '문법' },
      { id: 'b2', name: '문학개론' },
    ],
    book_pages: [
      { book_id: 'b1', page_num: 10, content: '把자문은 목적어를 동사 앞으로 이동시킨다' },
      { book_id: 'b1', page_num: 5, content: '겸어문에 대한 설명' },
      { book_id: 'b2', page_num: 3, content: '把자문에 대한 문학적 접근' },
    ],
    ...overrides,
  };
}

describe('searchBookPages', () => {
  it('matches book_pages content across all books, grouped by book and ordered by page', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await searchBookPages(supabase as any, '把자문');

    expect(result).toEqual([
      { bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문은 목적어를 동사 앞으로 이동시킨다' },
      { bookId: 'b2', bookName: '문학개론', pageNum: 3, content: '把자문에 대한 문학적 접근' },
    ]);
  });

  it('returns an empty array when nothing matches', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await searchBookPages(supabase as any, '존재하지않는단어들');

    expect(result).toEqual([]);
  });

  it('caps results at 30 matches', async () => {
    const manyPages = Array.from({ length: 40 }, (_, i) => ({
      book_id: 'b1',
      page_num: i + 1,
      content: `공통검색어 페이지 ${i + 1}`,
    }));
    const supabase = createMockSupabase(baseTables({ book_pages: manyPages }));

    const result = await searchBookPages(supabase as any, '공통검색어');

    expect(result).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- searchBookPages`
Expected: FAIL — `searchBookPages.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/search/searchBookPages.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SearchMatch {
  bookId: string;
  bookName: string;
  pageNum: number;
  content: string;
}

const MAX_MATCHES = 30;

export async function searchBookPages(supabase: SupabaseClient, query: string): Promise<SearchMatch[]> {
  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('book_id, page_num, content')
    .ilike('content', `%${query}%`);
  if (pagesError) throw new Error(`Failed to search book pages: ${pagesError.message}`);

  const { data: books, error: booksError } = await (supabase.from('books') as any).select('id, name');
  if (booksError) throw new Error(`Failed to fetch books: ${booksError.message}`);
  const bookNameById = new Map<string, string>((books ?? []).map((b: any) => [b.id, b.name]));

  // Sort client-side rather than relying on Supabase's .order() — this repo's mock Supabase
  // helper doesn't implement ordering, and other functions in this codebase (e.g. getTopicDetail)
  // already sort client-side for the same reason, keeping behavior identical in tests and prod.
  const sorted = [...(pages ?? [])].sort((a: any, b: any) =>
    a.book_id === b.book_id ? a.page_num - b.page_num : String(a.book_id).localeCompare(b.book_id)
  );

  return sorted.slice(0, MAX_MATCHES).map((p: any) => ({
    bookId: p.book_id,
    bookName: bookNameById.get(p.book_id) ?? '',
    pageNum: p.page_num,
    content: p.content,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- searchBookPages`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/searchBookPages.ts src/lib/search/searchBookPages.test.ts
git commit -m "feat: add searchBookPages for keyword search across all books"
```

---

### Task 2: `answerSearchQuery`

**Files:**
- Create: `src/lib/ai/answerSearchQuery.ts`
- Test: `src/lib/ai/answerSearchQuery.test.ts`

**Interfaces:**
- Produces: `SearchExcerpt { bookName: string; pageNum: number; content: string }`,
  `SearchHistoryTurn { question: string; answer: string }`,
  `AnswerSearchQueryInput { query: string; excerpts: SearchExcerpt[]; history?: SearchHistoryTurn[] }`,
  `answerSearchQuery(client: Anthropic, input: AnswerSearchQueryInput): Promise<string>` — consumed
  by Task 3.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/ai/answerSearchQuery.test.ts
import { describe, it, expect, vi } from 'vitest';
import { answerSearchQuery } from './answerSearchQuery';

describe('answerSearchQuery', () => {
  it('includes the query and excerpt content in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '답변입니다' }] }),
      },
    } as any;

    const result = await answerSearchQuery(client, {
      query: '把자문',
      excerpts: [{ bookName: '문법', pageNum: 10, content: '把자문은 목적어를 동사 앞으로 이동시킨다' }],
    });

    expect(result).toBe('답변입니다');
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('把자문');
    expect(sentPrompt).toContain('문법 10페이지');
    expect(sentPrompt).toContain('把자문은 목적어를 동사 앞으로 이동시킨다');
  });

  it('includes prior Q&A history in the prompt when provided', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '후속 답변' }] }),
      },
    } as any;

    await answerSearchQuery(client, {
      query: '그럼 겸어문은?',
      excerpts: [{ bookName: '문법', pageNum: 20, content: '겸어문 관련 내용' }],
      history: [{ question: '把자문이 뭐야?', answer: '把자문은 ~입니다' }],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('把자문이 뭐야?');
    expect(sentPrompt).toContain('把자문은 ~입니다');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- answerSearchQuery`
Expected: FAIL — `answerSearchQuery.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Do not cap this at a fixed sentence count — see this plan's Global Constraints and
`src/lib/ai/explainTopic.ts` for why.

```ts
// src/lib/ai/answerSearchQuery.ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface SearchExcerpt {
  bookName: string;
  pageNum: number;
  content: string;
}

export interface SearchHistoryTurn {
  question: string;
  answer: string;
}

export interface AnswerSearchQueryInput {
  query: string;
  excerpts: SearchExcerpt[];
  history?: SearchHistoryTurn[];
}

export async function answerSearchQuery(
  client: Anthropic,
  input: AnswerSearchQueryInput
): Promise<string> {
  const excerptsText = input.excerpts
    .map((e) => `[${e.bookName} ${e.pageNum}페이지] ${e.content}`)
    .join('\n\n');

  const historyText = (input.history ?? [])
    .map((h) => `이전 질문: ${h.question}\n이전 답변: ${h.answer}`)
    .join('\n\n');

  const prompt =
    (historyText ? `지금까지의 대화:\n${historyText}\n\n` : '') +
    `아래는 검색어 "${input.query}"와 관련해 교재에서 찾은 발췌문입니다:\n\n${excerptsText}\n\n` +
    `위 발췌문 내용에만 근거해서 "${input.query}"에 대해 학생이 실제로 이해할 수 있도록 답변해주세요. ` +
    `핵심 개념이나 용어의 이름만 나열하고 넘어가지 말고, 각각이 실제로 무슨 내용인지(정의, 하위 유형, ` +
    `예시 등 교재에 있는 구체적 내용)를 빠짐없이 설명하세요. 다룰 내용이 많으면 그만큼 길게 써도 좋으니, ` +
    `분량을 줄이는 것보다 각 개념의 실제 내용을 빠짐없이 전달하는 것을 최우선으로 하세요.`;

  return askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 튜터입니다. 반드시 주어진 발췌문 내용에만 근거해 답변하세요. ' +
      '발췌문에 없는 내용을 임의로 추가하지 마세요. 개념의 이름만 언급하고 넘어가지 말고, 그 개념이 ' +
      '실제로 무엇을 의미하는지 발췌문에 있는 구체적 내용으로 설명하세요. 중국어 표현을 인용할 때는 ' +
      '반드시 간체자(简体字)로만 작성하세요. 번체자(繁體字)는 절대 사용하지 마세요. 마크다운 문법 ' +
      '(#, **, -, 번호 매기기 등)을 사용하지 말고 일반 문장으로만 답하세요.',
    maxTokens: 2000,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- answerSearchQuery`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/answerSearchQuery.ts src/lib/ai/answerSearchQuery.test.ts
git commit -m "feat: add answerSearchQuery for grounded AI answers from search excerpts"
```

---

### Task 3: `runSearch` + `POST /api/search`

**Files:**
- Create: `src/lib/search/runSearch.ts`
- Test: `src/lib/search/runSearch.test.ts`
- Create: `src/app/api/search/route.ts`

**Interfaces:**
- Consumes: `searchBookPages`/`SearchMatch` (Task 1), `answerSearchQuery`/`SearchHistoryTurn`
  (Task 2).
- Produces: `RunSearchInput { query: string; history?: SearchHistoryTurn[] }`,
  `RunSearchResult { answer: string; matches: SearchMatch[] }`,
  `runSearch(supabase, aiClient, input: RunSearchInput): Promise<RunSearchResult>`. Route:
  `POST /api/search` → body `{ query: string; history?: { question: string; answer: string }[] }`
  → `{ answer: string; matches: SearchMatch[] }` — consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/search/runSearch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runSearch } from './runSearch';
import { searchBookPages } from './searchBookPages';
import { answerSearchQuery } from '../ai/answerSearchQuery';

vi.mock('./searchBookPages', () => ({ searchBookPages: vi.fn() }));
vi.mock('../ai/answerSearchQuery', () => ({ answerSearchQuery: vi.fn() }));

describe('runSearch', () => {
  it('searches, then answers using the matches, and returns both', async () => {
    vi.mocked(searchBookPages).mockResolvedValue([
      { bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 내용' },
    ]);
    vi.mocked(answerSearchQuery).mockResolvedValue('요약 답변');

    const result = await runSearch({} as any, {} as any, { query: '把자문' });

    expect(result).toEqual({
      answer: '요약 답변',
      matches: [{ bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 내용' }],
    });
    expect(vi.mocked(answerSearchQuery)).toHaveBeenCalledWith(
      {},
      {
        query: '把자문',
        excerpts: [{ bookName: '문법', pageNum: 10, content: '把자문 내용' }],
        history: undefined,
      }
    );
  });

  it('does not call the AI when there are zero matches', async () => {
    vi.mocked(searchBookPages).mockResolvedValue([]);

    const result = await runSearch({} as any, {} as any, { query: '없는단어' });

    expect(result).toEqual({ answer: '', matches: [] });
    expect(vi.mocked(answerSearchQuery)).not.toHaveBeenCalled();
  });

  it('caps the excerpts fed to the AI at 10, even with more matches', async () => {
    const manyMatches = Array.from({ length: 15 }, (_, i) => ({
      bookId: 'b1',
      bookName: '문법',
      pageNum: i + 1,
      content: `내용 ${i + 1}`,
    }));
    vi.mocked(searchBookPages).mockResolvedValue(manyMatches);
    vi.mocked(answerSearchQuery).mockResolvedValue('답변');

    await runSearch({} as any, {} as any, { query: '검색어' });

    const call = vi.mocked(answerSearchQuery).mock.calls[0][1];
    expect(call.excerpts).toHaveLength(10);
  });

  it('passes history through to answerSearchQuery', async () => {
    vi.mocked(searchBookPages).mockResolvedValue([
      { bookId: 'b1', bookName: '문법', pageNum: 5, content: '내용' },
    ]);
    vi.mocked(answerSearchQuery).mockResolvedValue('후속 답변');

    await runSearch({} as any, {} as any, {
      query: '후속질문',
      history: [{ question: '이전질문', answer: '이전답변' }],
    });

    const call = vi.mocked(answerSearchQuery).mock.calls[0][1];
    expect(call.history).toEqual([{ question: '이전질문', answer: '이전답변' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- runSearch`
Expected: FAIL — `runSearch.ts` doesn't exist yet.

- [ ] **Step 3: Write `runSearch`**

```ts
// src/lib/search/runSearch.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { searchBookPages, type SearchMatch } from './searchBookPages';
import { answerSearchQuery, type SearchHistoryTurn } from '../ai/answerSearchQuery';

const MAX_EXCERPTS_FOR_AI = 10;

export interface RunSearchInput {
  query: string;
  history?: SearchHistoryTurn[];
}

export interface RunSearchResult {
  answer: string;
  matches: SearchMatch[];
}

export async function runSearch(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: RunSearchInput
): Promise<RunSearchResult> {
  const matches = await searchBookPages(supabase, input.query);
  if (matches.length === 0) {
    return { answer: '', matches: [] };
  }

  const answer = await answerSearchQuery(aiClient, {
    query: input.query,
    excerpts: matches.slice(0, MAX_EXCERPTS_FOR_AI).map((m) => ({
      bookName: m.bookName,
      pageNum: m.pageNum,
      content: m.content,
    })),
    history: input.history,
  });

  return { answer, matches };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- runSearch`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the route**

```ts
// src/app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { runSearch } from '@/lib/search/runSearch';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    query: string;
    history?: { question: string; answer: string }[];
  };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const result = await runSearch(supabase, getAnthropicClient(), {
      query: body.query,
      history: body.history,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/search] failed:', err);
    return NextResponse.json({ error: '검색하지 못했어요' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/search/runSearch.ts src/lib/search/runSearch.test.ts src/app/api/search/route.ts
git commit -m "feat: add runSearch orchestration and POST /api/search route"
```

---

### Task 4: `/search` page

**Files:**
- Create: `src/app/search/page.tsx`
- Create: `src/app/search/search.module.css`
- Test: `src/app/search/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/search` (Task 3), existing `containsChinese` (`src/lib/containsChinese.ts`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/app/search/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchPage from './page';

function mockFetch(handlers: Record<string, (() => any) | (() => any)[]>) {
  const callCounts: Record<string, number> = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const key = init?.method === 'POST' ? `POST ${url}` : url;
      if (key in handlers) {
        const handler = handlers[key];
        if (Array.isArray(handler)) {
          const i = callCounts[key] ?? 0;
          callCounts[key] = i + 1;
          const fn = handler[Math.min(i, handler.length - 1)];
          return fn();
        }
        return handler();
      }
      throw new Error(`unhandled fetch: ${key}`);
    })
  );
}

describe('SearchPage', () => {
  it('searches and shows the AI answer plus matched excerpts', async () => {
    mockFetch({
      'POST /api/search': () => ({
        ok: true,
        json: async () => ({
          answer: '把자문은 목적어를 동사 앞으로 이동시키는 구문입니다.',
          matches: [{ bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 원문 내용' }],
        }),
      }),
    });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '把자문');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(
      await screen.findByText(/把자문은 목적어를 동사 앞으로 이동시키는 구문입니다/)
    ).toBeInTheDocument();
    expect(screen.getByText(/문법 · 10페이지/)).toBeInTheDocument();
    expect(screen.getByText('把자문 원문 내용')).toBeInTheDocument();
  });

  it('shows an empty state for a turn with no matches', async () => {
    mockFetch({
      'POST /api/search': () => ({ ok: true, json: async () => ({ answer: '', matches: [] }) }),
    });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '존재하지않는단어');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(await screen.findByText('검색 결과가 없어요.')).toBeInTheDocument();
  });

  it('lets the user ask a follow-up question that appends a second turn to the thread', async () => {
    mockFetch({
      'POST /api/search': [
        () => ({
          ok: true,
          json: async () => ({
            answer: '把자문 답변',
            matches: [{ bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 내용' }],
          }),
        }),
        () => ({
          ok: true,
          json: async () => ({
            answer: '겸어문 후속 답변',
            matches: [{ bookId: 'b1', bookName: '문법', pageNum: 20, content: '겸어문 내용' }],
          }),
        }),
      ],
    });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '把자문');
    await user.click(screen.getByRole('button', { name: '검색' }));
    await screen.findByText('把자문 답변');

    await user.type(screen.getByPlaceholderText('추가로 궁금한 걸 물어보세요'), '겸어문은?');
    await user.click(screen.getByRole('button', { name: '질문' }));

    expect(await screen.findByText('겸어문 후속 답변')).toBeInTheDocument();
    expect(screen.getByText('把자문 답변')).toBeInTheDocument();
  });

  it('shows an error message when the search request fails', async () => {
    mockFetch({ 'POST /api/search': () => ({ ok: false, status: 500 }) });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '把자문');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(await screen.findByText('검색하지 못했어요. 다시 시도해주세요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/app/search/page.test.tsx`
Expected: FAIL — `src/app/search/page.tsx` doesn't exist yet.

- [ ] **Step 3: Write the CSS**

```css
/* src/app/search/search.module.css */
.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.back {
  display: inline-block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

.searchRow,
.followupRow {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.searchInput {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--card-background);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

.searchButton {
  background: var(--search-accent);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.searchButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.error {
  font-size: 12px;
  color: #d64545;
  margin-bottom: 12px;
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
}

.turnCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-left: 4px solid var(--search-accent);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 16px;
}

.turnQuestion {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
}

.turnAnswer {
  font-size: 13px;
  line-height: 1.6;
  background: var(--search-accent-bg);
  color: var(--search-accent-text);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  white-space: pre-wrap;
}

.matchList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.matchItem {
  border-top: 1px solid var(--card-border);
  padding-top: 8px;
}

.matchMeta {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.matchContent {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
```

- [ ] **Step 4: Write the page**

```tsx
// src/app/search/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { containsChinese } from '@/lib/containsChinese';
import styles from './search.module.css';

interface SearchMatch {
  bookId: string;
  bookName: string;
  pageNum: number;
  content: string;
}

interface Turn {
  question: string;
  answer: string;
  matches: SearchMatch[];
}

export default function SearchPage() {
  const [queryInput, setQueryInput] = useState('');
  const [followupInput, setFollowupInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runQuery(query: string, history: { question: string; answer: string }[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, history: history.length > 0 ? history : undefined }),
      });
      if (!res.ok) {
        setError('검색하지 못했어요. 다시 시도해주세요.');
        return undefined;
      }
      return (await res.json()) as { answer: string; matches: SearchMatch[] };
    } catch (err) {
      console.error(err);
      setError('검색하지 못했어요. 다시 시도해주세요.');
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    const query = queryInput.trim();
    if (!query) return;
    const result = await runQuery(query, []);
    if (!result) return;
    setTurns([{ question: query, answer: result.answer, matches: result.matches }]);
    setQueryInput('');
  }

  async function handleFollowup() {
    const query = followupInput.trim();
    if (!query) return;
    const history = turns.map((t) => ({ question: t.question, answer: t.answer }));
    const result = await runQuery(query, history);
    if (!result) return;
    setTurns((prev) => [...prev, { question: query, answer: result.answer, matches: result.matches }]);
    setFollowupInput('');
  }

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ‹ 홈
      </Link>
      <h1 className={styles.title}>검색</h1>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="검색어를 입력하세요"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className={styles.searchButton} onClick={handleSearch} disabled={loading}>
          검색
        </button>
      </div>

      {loading && <p className={styles.hint}>검색 중...</p>}
      {error && <p className={styles.error}>{error}</p>}

      {turns.map((turn, i) => (
        <div key={i} className={styles.turnCard}>
          <p className={styles.turnQuestion}>{turn.question}</p>
          {turn.matches.length === 0 ? (
            <p className={styles.empty}>검색 결과가 없어요.</p>
          ) : (
            <>
              <p className={styles.turnAnswer}>{turn.answer}</p>
              <div className={styles.matchList}>
                {turn.matches.map((m, j) => (
                  <div key={j} className={styles.matchItem}>
                    <p className={styles.matchMeta}>
                      {m.bookName} · {m.pageNum}페이지
                    </p>
                    <p className={`${styles.matchContent}${containsChinese(m.content) ? ' zh' : ''}`}>
                      {m.content}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}

      {turns.length > 0 && (
        <div className={styles.followupRow}>
          <input
            className={styles.searchInput}
            value={followupInput}
            onChange={(e) => setFollowupInput(e.target.value)}
            placeholder="추가로 궁금한 걸 물어보세요"
            onKeyDown={(e) => e.key === 'Enter' && handleFollowup()}
          />
          <button className={styles.searchButton} onClick={handleFollowup} disabled={loading}>
            질문
          </button>
        </div>
      )}
    </main>
  );
}
```

Note: `turn.answer` is rendered plain, without the `containsChinese` → `zh` treatment — matching
the established pattern for AI-generated explanatory prose elsewhere in this app (e.g. 학습하기's
`.explanation` in `src/app/study/page.tsx`, which is also plain). Only raw textbook excerpts
(`turn.matches[].content`) get the conditional `zh` class, consistent with how 학습하기 treats its
raw page content vs. its AI explanation differently.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/app/search/page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/search/page.tsx src/app/search/search.module.css src/app/search/page.test.tsx
git commit -m "feat: add /search page for keyword search with follow-up questions"
```

---

### Task 5: "검색" nav card on `CoverScreen`

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/components/session.module.css`
- Modify: `src/app/components/CoverScreen.tsx`
- Modify: `src/app/components/CoverScreen.test.tsx`

**Interfaces:**
- Produces: `--search-accent`, `--search-accent-bg`, `--search-accent-text` CSS variables —
  consumed by this task's own `.navLinkSearch` class and by `src/app/search/search.module.css`
  (Task 4, which already references them).

- [ ] **Step 1: Write the failing test**

Add to `src/app/components/CoverScreen.test.tsx`, after the "links to study mode via a nav card"
test:

```tsx
  it('links to search via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/검색/).closest('a');
    expect(link).toHaveAttribute('href', '/search');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CoverScreen`
Expected: FAIL — no `/search` link yet.

- [ ] **Step 3: Add the CSS variables**

In `src/app/globals.css`, add these three lines right after the existing
`--study-accent-text: #1c6b48;` line:

```css
  --search-accent: #cc5b47;
  --search-accent-bg: #fbeae6;
  --search-accent-text: #96402f;
```

- [ ] **Step 4: Add the nav card CSS**

In `src/app/components/session.module.css`, add this class right after `.navLinkStudy`:

```css
.navLinkSearch {
  border-left: 4px solid var(--search-accent);
}
```

- [ ] **Step 5: Add the card to `CoverScreen`**

In `src/app/components/CoverScreen.tsx`, add a sixth `Link` right after the 학습하기 one:

```tsx
        <Link href="/search" className={`${styles.navLink} ${styles.navLinkSearch}`}>
          검색 <span className={styles.navLinkArrow} aria-hidden="true">›</span>
        </Link>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- CoverScreen`
Expected: PASS (all `CoverScreen` tests, including the new one)

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/components/session.module.css \
  src/app/components/CoverScreen.tsx src/app/components/CoverScreen.test.tsx
git commit -m "feat: add 검색 nav card to the cover screen"
```

---

## After all tasks

1. Run the full suite: `npm test` and `npx tsc --noEmit` — confirm nothing else broke.
2. Manually verify in the browser: search a term known to appear in more than one book, confirm
   the AI answer and grouped excerpts render; search a nonsense term and confirm the empty state;
   ask a follow-up and confirm it appends to the thread without losing the first turn; confirm the
   home screen's new "검색" card matches the other five cards' visual treatment.
