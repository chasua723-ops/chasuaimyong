# 학습하기 (Study Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "학습하기" study mode — pick a subject, pick a topic from its real
table-of-contents, read the textbook content plus an AI explanation, then jump into topic-scoped
practice questions — without touching any existing feature.

**Architecture:** A new `topics` table (2-level: chapter → section, each with a `[start_page,
end_page]` range derived from the book's real TOC) backs a new `/study` page. Practice questions
reuse the existing quiz-generation pipeline (`generateFromRandomPage`, `questions`/`attempts`
tables, `QuizQuestion` component) scoped to the chosen topic's page range instead of the book's
daily-pacing range.

**Tech Stack:** Next.js App Router, Supabase (Postgres), Anthropic Claude API via the existing
`src/lib/ai/client.ts` wrapper, Vitest + Testing Library.

## Global Constraints

- All new UI text is Korean, matching the rest of the app.
- Any Chinese text the AI generates must be 简体字 (simplified) only — never 繁體字. Bake this into
  every new AI system prompt, matching `explainAnswer.ts`/`gradeEssay.ts`.
- Purely additive: do not modify any existing table, route, or component's behavior.
- No new auth work needed — `src/middleware.ts` already PIN-gates every route except `/login` and
  `/api/auth`, so all new pages/routes are covered automatically.
- This repo has no migration runner. Migration SQL files are written but must be run manually in
  the Supabase SQL Editor. Tests use `createMockSupabase` and never touch a real database, so this
  never blocks a task's test cycle — only end-to-end manual verification.
- Route handlers (`route.ts`) are not unit-tested anywhere in this codebase — only `src/lib/**`
  functions get test files. Follow that convention; do not add `route.test.ts` files.
- All AI calls go through `askClaude`/`askClaudeVision`/`parseJsonResponse` in
  `src/lib/ai/client.ts`. Never call `client.messages.create` directly from a new file.
- Mock Supabase in tests via `tests/helpers/mockSupabase.ts`'s `createMockSupabase`, following the
  exact patterns already used in `generateQuizPractice.test.ts` / `getEssayNotes.test.ts`.

---

### Task 1: `topics` table + `TopicRow` type

**Files:**
- Create: `supabase/migrations/0003_topics.sql`
- Modify: `src/types/db.ts`

**Interfaces:**
- Produces: `TopicRow` — `{ id: string; book_id: string; parent_id: string | null; name: string; start_page: number; end_page: number; explanation: string | null }`, used by every later task.

This task has no test cycle of its own (a schema file and a type declaration have nothing to unit
test) — write both, then commit.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0003_topics.sql
-- Run this manually in the Supabase SQL Editor before running the topic ingestion script
-- (Task 6) or exercising the /study feature against a real database. This repo has no
-- migration runner — schema changes are never applied automatically.
create table topics (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  parent_id uuid references topics(id) on delete cascade,
  name text not null,
  start_page integer not null,
  end_page integer not null,
  explanation text,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Add the `TopicRow` type**

Add to `src/types/db.ts`, after `CategoryStatRow`:

```ts
export interface TopicRow {
  id: string;
  book_id: string;
  parent_id: string | null;
  name: string;
  start_page: number;
  end_page: number;
  explanation: string | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_topics.sql src/types/db.ts
git commit -m "feat: add topics table and TopicRow type for study mode"
```

---

### Task 2: `computeTopicRanges`

**Files:**
- Create: `src/lib/topics/computeTopicRanges.ts`
- Test: `src/lib/topics/computeTopicRanges.test.ts`

**Interfaces:**
- Produces: `ParsedChapter { name: string; startPage: number; children: { name: string; startPage: number }[] }`, `TopicRange { name: string; startPage: number; endPage: number }`, `ChapterRange extends TopicRange { children: TopicRange[] }`, `computeTopicRanges(chapters: ParsedChapter[], totalPages: number): ChapterRange[]` — consumed by Task 6 (ingestion script).

A chapter's own `endPage` is its last child's `endPage` (or its own, if it has no children — it's
a leaf itself in that case). Every entry's `endPage` is the page before the *next entry in the
whole book*, in document order, regardless of which chapter that next entry belongs to; the very
last entry in the book runs to `totalPages`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/topics/computeTopicRanges.test.ts
import { describe, it, expect } from 'vitest';
import { computeTopicRanges } from './computeTopicRanges';

describe('computeTopicRanges', () => {
  it('computes each section end page from the next section (or next chapter) start page, and extends the last one to totalPages', () => {
    const result = computeTopicRanges(
      [
        {
          name: '1장',
          startPage: 1,
          children: [
            { name: '1절', startPage: 1 },
            { name: '2절', startPage: 5 },
          ],
        },
        {
          name: '2장',
          startPage: 10,
          children: [{ name: '1절', startPage: 10 }],
        },
      ],
      20
    );

    expect(result).toEqual([
      {
        name: '1장',
        startPage: 1,
        endPage: 9,
        children: [
          { name: '1절', startPage: 1, endPage: 4 },
          { name: '2절', startPage: 5, endPage: 9 },
        ],
      },
      {
        name: '2장',
        startPage: 10,
        endPage: 20,
        children: [{ name: '1절', startPage: 10, endPage: 20 }],
      },
    ]);
  });

  it('treats a childless chapter as its own leaf, ranged against whatever comes next in the book', () => {
    const result = computeTopicRanges(
      [
        { name: '서론', startPage: 1, children: [] },
        {
          name: '1장',
          startPage: 3,
          children: [
            { name: '1절', startPage: 3 },
            { name: '2절', startPage: 8 },
          ],
        },
      ],
      15
    );

    expect(result).toEqual([
      { name: '서론', startPage: 1, endPage: 2, children: [] },
      {
        name: '1장',
        startPage: 3,
        endPage: 15,
        children: [
          { name: '1절', startPage: 3, endPage: 7 },
          { name: '2절', startPage: 8, endPage: 15 },
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- computeTopicRanges`
Expected: FAIL — `computeTopicRanges.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/topics/computeTopicRanges.ts
export interface ParsedChapter {
  name: string;
  startPage: number;
  children: { name: string; startPage: number }[];
}

export interface TopicRange {
  name: string;
  startPage: number;
  endPage: number;
}

export interface ChapterRange extends TopicRange {
  children: TopicRange[];
}

interface Leaf {
  chapterIndex: number;
  childIndex: number | null; // null = the chapter itself has no children and is the leaf
  startPage: number;
}

export function computeTopicRanges(chapters: ParsedChapter[], totalPages: number): ChapterRange[] {
  const leaves: Leaf[] = [];
  chapters.forEach((chapter, chapterIndex) => {
    if (chapter.children.length === 0) {
      leaves.push({ chapterIndex, childIndex: null, startPage: chapter.startPage });
    } else {
      chapter.children.forEach((child, childIndex) => {
        leaves.push({ chapterIndex, childIndex, startPage: child.startPage });
      });
    }
  });

  leaves.sort((a, b) => a.startPage - b.startPage);

  const endPageForLeaf = (leafIndex: number) =>
    leafIndex === leaves.length - 1 ? totalPages : leaves[leafIndex + 1].startPage - 1;

  return chapters.map((chapter, chapterIndex) => {
    if (chapter.children.length === 0) {
      const leafIndex = leaves.findIndex(
        (l) => l.chapterIndex === chapterIndex && l.childIndex === null
      );
      return {
        name: chapter.name,
        startPage: chapter.startPage,
        endPage: endPageForLeaf(leafIndex),
        children: [],
      };
    }

    const children: TopicRange[] = chapter.children.map((child, childIndex) => {
      const leafIndex = leaves.findIndex(
        (l) => l.chapterIndex === chapterIndex && l.childIndex === childIndex
      );
      return { name: child.name, startPage: child.startPage, endPage: endPageForLeaf(leafIndex) };
    });

    return {
      name: chapter.name,
      startPage: chapter.startPage,
      endPage: children[children.length - 1].endPage,
      children,
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- computeTopicRanges`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/topics/computeTopicRanges.ts src/lib/topics/computeTopicRanges.test.ts
git commit -m "feat: add computeTopicRanges for deriving topic page ranges from a TOC tree"
```

---

### Task 3: `groupTopics`

**Files:**
- Create: `src/lib/topics/groupTopics.ts`
- Test: `src/lib/topics/groupTopics.test.ts`

**Interfaces:**
- Consumes: `TopicRow` (Task 1).
- Produces: `TopicGroup { parent: TopicRow; children: TopicRow[] }`, `groupTopics(topics: TopicRow[]): TopicGroup[]` — consumed by Task 11 (`/study` page).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/topics/groupTopics.test.ts
import { describe, it, expect } from 'vitest';
import { groupTopics } from './groupTopics';
import type { TopicRow } from '@/types/db';

function topic(overrides: Partial<TopicRow>): TopicRow {
  return {
    id: 't',
    book_id: 'b1',
    parent_id: null,
    name: '',
    start_page: 1,
    end_page: 1,
    explanation: null,
    ...overrides,
  };
}

describe('groupTopics', () => {
  it('groups each top-level topic with its children, preserving order', () => {
    const topics: TopicRow[] = [
      topic({ id: 'p1', name: '1장' }),
      topic({ id: 'c1', parent_id: 'p1', name: '1절' }),
      topic({ id: 'c2', parent_id: 'p1', name: '2절' }),
      topic({ id: 'p2', name: '2장' }),
      topic({ id: 'c3', parent_id: 'p2', name: '1절' }),
    ];

    const result = groupTopics(topics);

    expect(result).toEqual([
      { parent: topics[0], children: [topics[1], topics[2]] },
      { parent: topics[3], children: [topics[4]] },
    ]);
  });

  it('gives a childless top-level topic an empty children array', () => {
    const topics: TopicRow[] = [topic({ id: 'p1', name: '서론' })];

    expect(groupTopics(topics)).toEqual([{ parent: topics[0], children: [] }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- groupTopics`
Expected: FAIL — `groupTopics.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/topics/groupTopics.ts
import type { TopicRow } from '@/types/db';

export interface TopicGroup {
  parent: TopicRow;
  children: TopicRow[];
}

export function groupTopics(topics: TopicRow[]): TopicGroup[] {
  const topLevel = topics.filter((t) => t.parent_id === null);
  return topLevel.map((parent) => ({
    parent,
    children: topics.filter((t) => t.parent_id === parent.id),
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- groupTopics`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/topics/groupTopics.ts src/lib/topics/groupTopics.test.ts
git commit -m "feat: add groupTopics for building the study-page topic dropdown"
```

---

### Task 4: `parseTocWithAI`

**Files:**
- Create: `src/lib/topics/parseTocWithAI.ts`
- Test: `src/lib/topics/parseTocWithAI.test.ts`

**Interfaces:**
- Consumes: `ParsedChapter` (Task 2, re-exported here as the return type), `askClaude`/`parseJsonResponse` from `src/lib/ai/client.ts`.
- Produces: `ParseTocInput { bookName: string; tocText: string }`, `parseTocWithAI(client: Anthropic, input: ParseTocInput): Promise<ParsedChapter[]>` — consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/topics/parseTocWithAI.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseTocWithAI } from './parseTocWithAI';

describe('parseTocWithAI', () => {
  it('parses the AI JSON response into a 2-level chapter tree, and includes the book name and TOC text in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                { name: '1장 품사론', startPage: 1, children: [{ name: '1절 수사', startPage: 3 }] },
              ]),
            },
          ],
        }),
      },
    } as any;

    const result = await parseTocWithAI(client, {
      bookName: '전공중국어 문법',
      tocText: '1장 품사론 ...... 1\n  1절 수사 ...... 3',
    });

    expect(result).toEqual([
      { name: '1장 품사론', startPage: 1, children: [{ name: '1절 수사', startPage: 3 }] },
    ]);
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('전공중국어 문법');
    expect(sentPrompt).toContain('1장 품사론 ...... 1');
  });

  it('strips a markdown code fence if Claude wraps the JSON in one', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '```json\n' + JSON.stringify([{ name: '1장', startPage: 1, children: [] }]) + '\n```',
            },
          ],
        }),
      },
    } as any;

    const result = await parseTocWithAI(client, { bookName: '책', tocText: '목차' });

    expect(result).toEqual([{ name: '1장', startPage: 1, children: [] }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- parseTocWithAI`
Expected: FAIL — `parseTocWithAI.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/topics/parseTocWithAI.ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, parseJsonResponse } from '../ai/client';
import type { ParsedChapter } from './computeTopicRanges';

export interface ParseTocInput {
  bookName: string;
  tocText: string;
}

export async function parseTocWithAI(
  client: Anthropic,
  input: ParseTocInput
): Promise<ParsedChapter[]> {
  const prompt =
    `다음은 "${input.bookName}" 교재의 목차(차례) 페이지 원문입니다:\n\n${input.tocText}\n\n` +
    `이 목차를 대분류(장)와 그 아래 소분류(절)로 구성된 2단계 트리로 정리해주세요. ` +
    `각 항목은 목차에 표시된 실제 페이지 번호(startPage)를 그대로 사용하세요. ` +
    `3단계 이상으로 세분화된 항목이 있다면, 그 하위 항목들을 별도로 만들지 말고 가장 가까운 ` +
    `소분류(절)에 합쳐서 2단계까지만 표현하세요.\n\n` +
    `아래 JSON 형식으로만 응답하세요 (다른 설명 없이):\n` +
    `[{"name": "장 이름", "startPage": 1, "children": [{"name": "절 이름", "startPage": 3}]}]`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 교재 목차를 구조화된 JSON으로 변환하는 도구입니다. 반드시 유효한 JSON만 응답하세요.',
    maxTokens: 4096,
  });

  return parseJsonResponse<ParsedChapter[]>(raw);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- parseTocWithAI`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/topics/parseTocWithAI.ts src/lib/topics/parseTocWithAI.test.ts
git commit -m "feat: add parseTocWithAI for structuring a TOC page into a topic tree"
```

---

### Task 5: `insertTopics`

**Files:**
- Create: `src/lib/topics/insertTopics.ts`
- Test: `src/lib/topics/insertTopics.test.ts`

**Interfaces:**
- Consumes: `ChapterRange` (Task 2).
- Produces: `insertTopics(supabase: SupabaseClient, bookId: string, chapters: ChapterRange[]): Promise<number>` (returns total rows inserted) — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/topics/insertTopics.test.ts
import { describe, it, expect } from 'vitest';
import { insertTopics } from './insertTopics';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

describe('insertTopics', () => {
  it('inserts each chapter and its children, wiring each child to its own parent via parent_id', async () => {
    const supabase = createMockSupabase({ topics: [] });

    const count = await insertTopics(supabase as any, 'b1', [
      {
        name: '1장 품사론',
        startPage: 1,
        endPage: 20,
        children: [
          { name: '1절 명사', startPage: 1, endPage: 10 },
          { name: '2절 수사', startPage: 11, endPage: 20 },
        ],
      },
      { name: '2장 문장론', startPage: 21, endPage: 30, children: [] },
    ]);

    expect(count).toBe(4);
    const inserted = supabase.inserted.topics;
    expect(inserted).toHaveLength(4);

    const chapter1 = inserted.find((r: any) => r.name === '1장 품사론');
    const chapter2 = inserted.find((r: any) => r.name === '2장 문장론');
    const child1 = inserted.find((r: any) => r.name === '1절 명사');
    const child2 = inserted.find((r: any) => r.name === '2절 수사');

    expect(chapter1).toMatchObject({ book_id: 'b1', parent_id: null, start_page: 1, end_page: 20 });
    expect(chapter2).toMatchObject({ book_id: 'b1', parent_id: null, start_page: 21, end_page: 30 });
    expect(child1.parent_id).toBeTruthy();
    expect(child2.parent_id).toBe(child1.parent_id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- insertTopics`
Expected: FAIL — `insertTopics.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/topics/insertTopics.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChapterRange } from './computeTopicRanges';

export async function insertTopics(
  supabase: SupabaseClient,
  bookId: string,
  chapters: ChapterRange[]
): Promise<number> {
  let count = 0;
  for (const chapter of chapters) {
    const { data: parentRow, error: parentError } = await (supabase.from('topics') as any)
      .insert({
        book_id: bookId,
        parent_id: null,
        name: chapter.name,
        start_page: chapter.startPage,
        end_page: chapter.endPage,
      })
      .select()
      .single();
    if (parentError) {
      throw new Error(`Failed to insert chapter "${chapter.name}": ${parentError.message}`);
    }
    count += 1;

    for (const child of chapter.children) {
      const { error: childError } = await (supabase.from('topics') as any).insert({
        book_id: bookId,
        parent_id: parentRow.id,
        name: child.name,
        start_page: child.startPage,
        end_page: child.endPage,
      });
      if (childError) {
        throw new Error(`Failed to insert topic "${child.name}": ${childError.message}`);
      }
      count += 1;
    }
  }
  return count;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- insertTopics`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/topics/insertTopics.ts src/lib/topics/insertTopics.test.ts
git commit -m "feat: add insertTopics for writing a computed chapter tree to the topics table"
```

---

### Task 6: Ingestion script (`ingest-topics`)

**Files:**
- Create: `scripts/ingest-topics.ts`
- Create: `scripts/ingest-topics-cli.ts`
- Test: `scripts/ingest-topics.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `parseTocWithAI` (Task 4), `computeTopicRanges` (Task 2), `insertTopics` (Task 5).
- Produces: `IngestTopicsInput { bookId: string; tocStartPage: number; tocEndPage: number }`, `ingestTopics(supabase: SupabaseClient, aiClient: Anthropic, input: IngestTopicsInput): Promise<number>` — this is the last task in the topic-ingestion chain; nothing later depends on it directly (it's operated manually, once per book, via the CLI).

**Operational note (not part of the automated test cycle):** before running this for real against
any book, find that book's TOC page range by looking at its `book_pages` rows (or the source PDF)
for the actual 목차/차례 pages. After running it, spot-check a few `start_page` values in the
`topics` table against the book's real page numbers — front matter (표지, 서문, 목차 자체) can
cause the TOC's printed page numbers to drift from `book_pages.page_num`. Fix any offset (e.g. by
re-running with corrected `tocStartPage`/`tocEndPage`, or adjusting the source pages) before
moving to the next book.

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/ingest-topics.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ingestTopics } from './ingest-topics';
import { parseTocWithAI } from '../src/lib/topics/parseTocWithAI';
import { createMockSupabase } from '../tests/helpers/mockSupabase';

vi.mock('../src/lib/topics/parseTocWithAI', () => ({
  parseTocWithAI: vi.fn().mockResolvedValue([
    {
      name: '1장',
      startPage: 1,
      children: [
        { name: '1절', startPage: 1 },
        { name: '2절', startPage: 5 },
      ],
    },
  ]),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', total_pages: 20 }],
    book_pages: [
      { book_id: 'b1', page_num: 1, content: '목차 1페이지' },
      { book_id: 'b1', page_num: 2, content: '목차 2페이지' },
    ],
    topics: [],
    ...overrides,
  };
}

describe('ingestTopics', () => {
  it('parses the TOC pages in order, computes ranges from the book total_pages, and inserts the resulting topics', async () => {
    const supabase = createMockSupabase(baseTables());

    const count = await ingestTopics(supabase as any, {} as any, {
      bookId: 'b1',
      tocStartPage: 1,
      tocEndPage: 2,
    });

    expect(count).toBe(3); // 1 chapter + 2 children
    expect(vi.mocked(parseTocWithAI)).toHaveBeenCalledWith(
      {},
      { bookName: '전공중국어 문법', tocText: '목차 1페이지\n목차 2페이지' }
    );
    const child2 = supabase.inserted.topics.find((r: any) => r.name === '2절');
    expect(child2).toMatchObject({ start_page: 5, end_page: 20 }); // last leaf extends to total_pages
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      ingestTopics(supabase as any, {} as any, { bookId: 'missing', tocStartPage: 1, tocEndPage: 2 })
    ).rejects.toThrow('Book not found');
  });

  it('throws when no book_pages exist in the given TOC page range', async () => {
    const supabase = createMockSupabase(baseTables({ book_pages: [] }));

    await expect(
      ingestTopics(supabase as any, {} as any, { bookId: 'b1', tocStartPage: 1, tocEndPage: 2 })
    ).rejects.toThrow('No book_pages found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ingest-topics`
Expected: FAIL — `ingest-topics.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/ingest-topics.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { parseTocWithAI } from '../src/lib/topics/parseTocWithAI';
import { computeTopicRanges } from '../src/lib/topics/computeTopicRanges';
import { insertTopics } from '../src/lib/topics/insertTopics';

export interface IngestTopicsInput {
  bookId: string;
  tocStartPage: number;
  tocEndPage: number;
}

export async function ingestTopics(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: IngestTopicsInput
): Promise<number> {
  const { data: book, error: bookError } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', input.bookId)
    .single();
  if (bookError || !book) throw new Error(`Book not found: ${input.bookId}`);

  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('page_num, content')
    .eq('book_id', input.bookId)
    .gte('page_num', input.tocStartPage)
    .lte('page_num', input.tocEndPage);
  if (pagesError) throw new Error(`Failed to fetch TOC pages: ${pagesError.message}`);
  if (!pages || pages.length === 0) {
    throw new Error('No book_pages found in the given TOC page range');
  }

  const tocText = [...pages]
    .sort((a: any, b: any) => a.page_num - b.page_num)
    .map((p: any) => p.content)
    .join('\n');

  const chapters = await parseTocWithAI(aiClient, { bookName: book.name, tocText });
  const ranges = computeTopicRanges(chapters, book.total_pages);
  return insertTopics(supabase, input.bookId, ranges);
}
```

```ts
// scripts/ingest-topics-cli.ts
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
import { ingestTopics } from './ingest-topics';
import { getAnthropicClient } from '../src/lib/ai/client';

const [, , bookId, tocStartPageStr, tocEndPageStr] = process.argv;

if (!bookId || !tocStartPageStr || !tocEndPageStr) {
  console.error('Usage: npm run ingest:topics -- <bookId> <tocStartPage> <tocEndPage>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

ingestTopics(supabase, getAnthropicClient(), {
  bookId,
  tocStartPage: Number(tocStartPageStr),
  tocEndPage: Number(tocEndPageStr),
})
  .then((count) => console.log(`Inserted ${count} topics`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

Add to `package.json`'s `"scripts"` block, next to the existing `ingest:*` entries:

```json
"ingest:topics": "tsx scripts/ingest-topics-cli.ts",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ingest-topics`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-topics.ts scripts/ingest-topics-cli.ts scripts/ingest-topics.test.ts package.json
git commit -m "feat: add ingest-topics script for building each book's topic tree from its TOC"
```

---

### Task 7: `GET /api/books` and `GET /api/topics` routes

**Files:**
- Create: `src/app/api/books/route.ts`
- Create: `src/app/api/topics/route.ts`

**Interfaces:**
- Produces: `GET /api/books` → `{ books: { id: string; name: string }[] }`. `GET /api/topics?bookId=...` → `{ topics: TopicRow[] }`. Both consumed by Task 11 (`/study` page).

Both routes are thin, direct Supabase queries with no real branching logic — following this
codebase's convention (see `/api/session/today/route.ts`), they are not wrapped in a separate
`src/lib` function and have no test file.

- [ ] **Step 1: Write `GET /api/books`**

```ts
// src/app/api/books/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: books, error } = await supabase.from('books').select('id, name');
  if (error) {
    console.error('[GET /api/books] failed:', error);
    return NextResponse.json({ error: '과목을 불러오지 못했어요' }, { status: 500 });
  }
  return NextResponse.json({ books: books ?? [] });
}
```

- [ ] **Step 2: Write `GET /api/topics`**

```ts
// src/app/api/topics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get('bookId');
  if (!bookId) return NextResponse.json({ error: 'bookId is required' }, { status: 400 });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: topics, error } = await supabase.from('topics').select('*').eq('book_id', bookId);
  if (error) {
    console.error('[GET /api/topics] failed:', error);
    return NextResponse.json({ error: '주제를 불러오지 못했어요' }, { status: 500 });
  }
  return NextResponse.json({ topics: topics ?? [] });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/books/route.ts src/app/api/topics/route.ts
git commit -m "feat: add GET /api/books and GET /api/topics routes for study mode"
```

---

### Task 8: Topic detail + explanation (`explainTopic`, `getTopicDetail`, `getOrGenerateExplanation` + their routes)

**Files:**
- Create: `src/lib/ai/explainTopic.ts`
- Test: `src/lib/ai/explainTopic.test.ts`
- Create: `src/lib/topics/getTopicDetail.ts`
- Test: `src/lib/topics/getTopicDetail.test.ts`
- Create: `src/lib/topics/getOrGenerateExplanation.ts`
- Test: `src/lib/topics/getOrGenerateExplanation.test.ts`
- Create: `src/app/api/study/[topicId]/route.ts`
- Create: `src/app/api/study/[topicId]/explain/route.ts`

**Interfaces:**
- Produces: `GET /api/study/[topicId]` → `{ topic: { id, name, startPage, endPage }, content: string, explanation: string | null }`. `POST /api/study/[topicId]/explain` → `{ explanation: string }`, and persists it to `topics.explanation` so later views skip regenerating. Both consumed by Task 11.

- [ ] **Step 1: Write the failing test for `explainTopic`**

```ts
// src/lib/ai/explainTopic.test.ts
import { describe, it, expect, vi } from 'vitest';
import { explainTopic } from './explainTopic';

describe('explainTopic', () => {
  it('includes the book name, topic name, and page content in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '설명입니다' }] }),
      },
    } as any;

    const result = await explainTopic(client, {
      bookName: '전공중국어 문법',
      topicName: '수사',
      content: '수사는 명사 앞에 온다',
    });

    expect(result).toBe('설명입니다');
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('전공중국어 문법');
    expect(sentPrompt).toContain('수사');
    expect(sentPrompt).toContain('수사는 명사 앞에 온다');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- explainTopic`
Expected: FAIL — `explainTopic.ts` doesn't exist yet.

- [ ] **Step 3: Implement `explainTopic`**

Do not cap the explanation at a fixed sentence count. The sibling project
(`educational-theory-app`) shipped an identical `explainTopic` with a hard "5~8문장 이내로" cap and
hit a real bug: with more concepts to cover than the cap allowed, the model complied by naming
each concept without explaining what it actually meant. The fix there was to drop the sentence
cap, explicitly instruct explaining each concept's real content (not just naming it), let length
scale with how much there is to explain, and raise `maxTokens` accordingly — already applied in
the code below.

```ts
// src/lib/ai/explainTopic.ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface ExplainTopicInput {
  bookName: string;
  topicName: string;
  content: string;
}

export async function explainTopic(client: Anthropic, input: ExplainTopicInput): Promise<string> {
  const prompt =
    `다음은 "${input.bookName}" 교재의 "${input.topicName}" 부분 원문입니다:\n\n${input.content}\n\n` +
    `위 교재 내용에만 근거해서, "${input.topicName}"을 학생이 실제로 이해하고 암기할 수 있도록 ` +
    `설명해주세요. 핵심 개념이나 용어의 이름만 나열하고 넘어가지 말고, 각각이 실제로 무슨 내용인지 ` +
    `(정의, 하위 유형, 예시 등 교재에 있는 구체적 내용)를 빠짐없이 설명하세요. 다룰 내용이 많으면 ` +
    `그만큼 길게 써도 좋으니, 분량을 줄이는 것보다 각 개념의 실제 내용을 빠짐없이 전달하는 것을 ` +
    `최우선으로 하세요.`;

  return askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 튜터입니다. 반드시 주어진 교재 내용에만 근거해 설명하세요. ' +
      '교재에 없는 내용을 임의로 추가하지 마세요. 개념의 이름만 언급하고 넘어가지 말고, 그 개념이 ' +
      '실제로 무엇을 의미하는지 교재에 있는 구체적 내용으로 설명하세요. 중국어 표현을 인용할 때는 ' +
      '반드시 간체자(简体字)로만 작성하세요. 번체자(繁體字)는 절대 사용하지 마세요. 마크다운 문법 ' +
      '(#, **, -, 번호 매기기 등)을 사용하지 말고 일반 문장으로만 답하세요.',
    maxTokens: 2000,
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- explainTopic`
Expected: PASS (1 test)

- [ ] **Step 5: Write the failing tests for `getTopicDetail`**

```ts
// src/lib/topics/getTopicDetail.test.ts
import { describe, it, expect } from 'vitest';
import { getTopicDetail } from './getTopicDetail';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    topics: [
      {
        id: 't1',
        book_id: 'b1',
        parent_id: null,
        name: '수사',
        start_page: 30,
        end_page: 32,
        explanation: null,
      },
    ],
    book_pages: [
      { book_id: 'b1', page_num: 30, content: '30페이지 내용' },
      { book_id: 'b1', page_num: 31, content: '31페이지 내용' },
      { book_id: 'b1', page_num: 32, content: '32페이지 내용' },
    ],
    ...overrides,
  };
}

describe('getTopicDetail', () => {
  it('returns the topic, its page content concatenated in page order, and a null explanation when none is cached', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await getTopicDetail(supabase as any, 't1');

    expect(result.topic).toEqual({ id: 't1', name: '수사', startPage: 30, endPage: 32 });
    expect(result.content).toBe('30페이지 내용\n\n31페이지 내용\n\n32페이지 내용');
    expect(result.explanation).toBeNull();
  });

  it('returns the cached explanation when present', async () => {
    const supabase = createMockSupabase(
      baseTables({
        topics: [
          {
            id: 't1',
            book_id: 'b1',
            parent_id: null,
            name: '수사',
            start_page: 30,
            end_page: 32,
            explanation: '기존 해설',
          },
        ],
      })
    );

    const result = await getTopicDetail(supabase as any, 't1');

    expect(result.explanation).toBe('기존 해설');
  });

  it('throws when the topic is not found', async () => {
    const supabase = createMockSupabase(baseTables({ topics: [] }));

    await expect(getTopicDetail(supabase as any, 'missing')).rejects.toThrow('Topic not found');
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npm test -- getTopicDetail`
Expected: FAIL — `getTopicDetail.ts` doesn't exist yet.

- [ ] **Step 7: Implement `getTopicDetail`**

```ts
// src/lib/topics/getTopicDetail.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TopicDetail {
  topic: { id: string; name: string; startPage: number; endPage: number };
  content: string;
  explanation: string | null;
}

export async function getTopicDetail(supabase: SupabaseClient, topicId: string): Promise<TopicDetail> {
  const { data: topic, error: topicError } = await (supabase.from('topics') as any)
    .select('*')
    .eq('id', topicId)
    .single();
  if (topicError || !topic) throw new Error(`Topic not found: ${topicId}`);

  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('page_num, content')
    .eq('book_id', topic.book_id)
    .gte('page_num', topic.start_page)
    .lte('page_num', topic.end_page);
  if (pagesError) throw new Error(`Failed to fetch topic content: ${pagesError.message}`);

  const content = [...(pages ?? [])]
    .sort((a: any, b: any) => a.page_num - b.page_num)
    .map((p: any) => p.content)
    .join('\n\n');

  return {
    topic: { id: topic.id, name: topic.name, startPage: topic.start_page, endPage: topic.end_page },
    content,
    explanation: topic.explanation ?? null,
  };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- getTopicDetail`
Expected: PASS (3 tests)

- [ ] **Step 9: Write the failing tests for `getOrGenerateExplanation`**

```ts
// src/lib/topics/getOrGenerateExplanation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrGenerateExplanation } from './getOrGenerateExplanation';
import { explainTopic } from '../ai/explainTopic';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('../ai/explainTopic', () => ({
  explainTopic: vi.fn().mockResolvedValue('새로 생성된 해설'),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    topics: [
      {
        id: 't1',
        book_id: 'b1',
        parent_id: null,
        name: '수사',
        start_page: 30,
        end_page: 30,
        explanation: null,
      },
    ],
    books: [{ id: 'b1', name: '전공중국어 문법' }],
    book_pages: [{ book_id: 'b1', page_num: 30, content: '30페이지 내용' }],
    ...overrides,
  };
}

describe('getOrGenerateExplanation', () => {
  beforeEach(() => {
    vi.mocked(explainTopic).mockClear();
  });

  it('generates and persists an explanation when none is cached', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await getOrGenerateExplanation(supabase as any, {} as any, 't1');

    expect(result).toBe('새로 생성된 해설');
    expect(vi.mocked(explainTopic)).toHaveBeenCalledWith(
      {},
      { bookName: '전공중국어 문법', topicName: '수사', content: '30페이지 내용' }
    );
  });

  it('returns the cached explanation without calling the AI again', async () => {
    const supabase = createMockSupabase(
      baseTables({
        topics: [
          {
            id: 't1',
            book_id: 'b1',
            parent_id: null,
            name: '수사',
            start_page: 30,
            end_page: 30,
            explanation: '이미 있음',
          },
        ],
      })
    );

    const result = await getOrGenerateExplanation(supabase as any, {} as any, 't1');

    expect(result).toBe('이미 있음');
    expect(vi.mocked(explainTopic)).not.toHaveBeenCalled();
  });

  it('throws when the topic is not found', async () => {
    const supabase = createMockSupabase(baseTables({ topics: [] }));

    await expect(
      getOrGenerateExplanation(supabase as any, {} as any, 'missing')
    ).rejects.toThrow('Topic not found');
  });
});
```

- [ ] **Step 10: Run them to verify they fail**

Run: `npm test -- getOrGenerateExplanation`
Expected: FAIL — `getOrGenerateExplanation.ts` doesn't exist yet.

- [ ] **Step 11: Implement `getOrGenerateExplanation`**

```ts
// src/lib/topics/getOrGenerateExplanation.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { explainTopic } from '../ai/explainTopic';

export async function getOrGenerateExplanation(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  topicId: string
): Promise<string> {
  const { data: topic, error: topicError } = await (supabase.from('topics') as any)
    .select('*')
    .eq('id', topicId)
    .single();
  if (topicError || !topic) throw new Error(`Topic not found: ${topicId}`);

  if (topic.explanation) return topic.explanation;

  const { data: book, error: bookError } = await (supabase.from('books') as any)
    .select('name')
    .eq('id', topic.book_id)
    .single();
  if (bookError || !book) throw new Error(`Book not found: ${topic.book_id}`);

  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('page_num, content')
    .eq('book_id', topic.book_id)
    .gte('page_num', topic.start_page)
    .lte('page_num', topic.end_page);
  if (pagesError) throw new Error(`Failed to fetch topic content: ${pagesError.message}`);

  const content = [...(pages ?? [])]
    .sort((a: any, b: any) => a.page_num - b.page_num)
    .map((p: any) => p.content)
    .join('\n\n');

  const explanation = await explainTopic(aiClient, {
    bookName: book.name,
    topicName: topic.name,
    content,
  });

  const { error: updateError } = await (supabase.from('topics') as any)
    .update({ explanation })
    .eq('id', topicId);
  if (updateError) throw new Error(`Failed to save explanation: ${updateError.message}`);

  return explanation;
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npm test -- getOrGenerateExplanation`
Expected: PASS (3 tests)

- [ ] **Step 13: Add the two routes**

```ts
// src/app/api/study/[topicId]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTopicDetail } from '@/lib/topics/getTopicDetail';

export async function GET(_req: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const detail = await getTopicDetail(supabase, topicId);
    return NextResponse.json(detail);
  } catch (err) {
    console.error('[GET /api/study/[topicId]] failed:', err);
    return NextResponse.json({ error: '학습 내용을 불러오지 못했어요' }, { status: 500 });
  }
}
```

```ts
// src/app/api/study/[topicId]/explain/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { getOrGenerateExplanation } from '@/lib/topics/getOrGenerateExplanation';

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const explanation = await getOrGenerateExplanation(supabase, getAnthropicClient(), topicId);
    return NextResponse.json({ explanation });
  } catch (err) {
    console.error('[POST /api/study/[topicId]/explain] failed:', err);
    return NextResponse.json({ error: '해설을 만들지 못했어요' }, { status: 500 });
  }
}
```

- [ ] **Step 14: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 15: Commit**

```bash
git add src/lib/ai/explainTopic.ts src/lib/ai/explainTopic.test.ts \
  src/lib/topics/getTopicDetail.ts src/lib/topics/getTopicDetail.test.ts \
  src/lib/topics/getOrGenerateExplanation.ts src/lib/topics/getOrGenerateExplanation.test.ts \
  "src/app/api/study/[topicId]/route.ts" "src/app/api/study/[topicId]/explain/route.ts"
git commit -m "feat: add topic detail view and cached AI explanation for study mode"
```

---

### Task 9: `generateTopicPractice` + practice route

**Files:**
- Create: `src/lib/quiz/generateTopicPractice.ts`
- Test: `src/lib/quiz/generateTopicPractice.test.ts`
- Create: `src/app/api/study/[topicId]/practice/route.ts`

**Interfaces:**
- Consumes: `generateFromRandomPage` (existing, `src/lib/quiz/generateFromRandomPage.ts`), `calculateWeights`/`pickWeightedTypes`/`QUIZ_TYPES`/`CategoryStat` (existing, `src/lib/adaptive.ts`).
- Produces: `POST /api/study/[topicId]/practice` → `{ id, type, prompt, choices, sourcePage }`, consumed by Task 11. Answering it reuses the **existing, unmodified** `POST /api/attempts`.

This mirrors `generateQuizPractice.ts` exactly, with one deliberate difference: it scopes
`generateFromRandomPage` to the **topic's own** `[start_page, end_page]` instead of
`[1, book.current_page]`. That's the whole point of 학습하기 practice — study any topic on demand,
regardless of how far the daily pacing has actually progressed.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/quiz/generateTopicPractice.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateTopicPractice } from './generateTopicPractice';
import { generateFromRandomPage } from './generateFromRandomPage';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('./generateFromRandomPage', () => ({
  generateFromRandomPage: vi.fn().mockResolvedValue({
    type: 'grammar',
    sourcePage: 34,
    prompt: '문제입니다',
    choices: ['A', 'B'],
    correctAnswer: 'A',
    usedReference: false,
  }),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', current_page: 5 }],
    topics: [{ id: 't1', book_id: 'b1', name: '수사', start_page: 30, end_page: 40 }],
    category_stats: [],
    questions: [],
    ...overrides,
  };
}

describe('generateTopicPractice', () => {
  it("generates a question scoped to the topic's own page range, not the book's current_page, and stores it with no session", async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateTopicPractice(supabase as any, {} as any, { topicId: 't1' });

    expect(result.prompt).toBe('문제입니다');
    expect(vi.mocked(generateFromRandomPage)).toHaveBeenCalledWith(
      supabase,
      {},
      expect.objectContaining({ bookId: 'b1', minPage: 30, maxPage: 40 })
    );
    expect(supabase.inserted.questions[0]).toMatchObject({ book_id: 'b1', session_id: null });
    randomSpy.mockRestore();
  });

  it('throws when the topic is not found', async () => {
    const supabase = createMockSupabase(baseTables({ topics: [] }));

    await expect(
      generateTopicPractice(supabase as any, {} as any, { topicId: 'missing' })
    ).rejects.toThrow('Topic not found');
  });

  it('throws when the topic references a missing book', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      generateTopicPractice(supabase as any, {} as any, { topicId: 't1' })
    ).rejects.toThrow('Book not found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- generateTopicPractice`
Expected: FAIL — `generateTopicPractice.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/quiz/generateTopicPractice.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '../adaptive';
import { generateFromRandomPage } from './generateFromRandomPage';

export interface GenerateTopicPracticeInput {
  topicId: string;
}

export interface TopicPracticeQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

export async function generateTopicPractice(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateTopicPracticeInput
): Promise<TopicPracticeQuestion> {
  const { data: topic, error: topicError } = await (supabase.from('topics') as any)
    .select('*')
    .eq('id', input.topicId)
    .single();
  if (topicError || !topic) throw new Error(`Topic not found: ${input.topicId}`);

  const { data: book, error: bookError } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', topic.book_id)
    .single();
  if (bookError || !book) throw new Error(`Book not found: ${topic.book_id}`);

  const { data: statsRows } = await (supabase.from('category_stats') as any).select('*');
  const stats: CategoryStat[] = (statsRows ?? []).map((r: any) => ({
    type: r.type,
    correctCount: r.correct_count,
    totalCount: r.total_count,
  }));
  const weights = calculateWeights(stats);
  const quizWeights = Object.fromEntries(
    QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
  ) as Record<(typeof QUIZ_TYPES)[number], number>;
  const [type] = pickWeightedTypes(quizWeights as any, 1);

  const generated = await generateFromRandomPage(supabase, aiClient, {
    bookId: topic.book_id,
    bookName: book.name,
    minPage: topic.start_page,
    maxPage: topic.end_page,
    type,
  });

  const { data: inserted, error } = await (supabase.from('questions') as any)
    .insert({
      book_id: topic.book_id,
      session_id: null,
      type: generated.type,
      source_page: generated.sourcePage,
      prompt: generated.prompt,
      choices: generated.choices ?? null,
      correct_answer: generated.correctAnswer,
      used_reference: generated.usedReference,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to insert topic practice question: ${error.message}`);

  return {
    id: inserted.id,
    type: inserted.type,
    prompt: inserted.prompt,
    choices: inserted.choices ?? null,
    sourcePage: inserted.source_page,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- generateTopicPractice`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the route**

```ts
// src/app/api/study/[topicId]/practice/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { generateTopicPractice } from '@/lib/quiz/generateTopicPractice';

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const question = await generateTopicPractice(supabase, getAnthropicClient(), { topicId });
    return NextResponse.json(question);
  } catch (err) {
    console.error('[POST /api/study/[topicId]/practice] failed:', err);
    return NextResponse.json({ error: '연습문제를 만들지 못했어요' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/quiz/generateTopicPractice.ts src/lib/quiz/generateTopicPractice.test.ts \
  "src/app/api/study/[topicId]/practice/route.ts"
git commit -m "feat: add generateTopicPractice for topic-scoped practice questions"
```

---

### Task 10: `pageState` localStorage helper

**Files:**
- Create: `src/lib/localStorage/pageState.ts`
- Test: `src/lib/localStorage/pageState.test.ts`

**Interfaces:**
- Produces: `savePageState<T>(key: string, data: T): void`, `loadPageState<T>(key: string): T | null`, `clearPageState(key: string): void` — consumed by Task 11. Data is namespaced by calendar day: anything saved on a previous day is discarded and treated as absent.

Named `pageState`, not `dailySession`, to avoid colliding in meaning with this app's existing
`daily_sessions` table / `assembleDailySession.ts` (a server-persisted, one-per-calendar-day
concept). This is purely a client-side, per-`localStorage`-key convenience cache.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/localStorage/pageState.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPageState, loadPageState, savePageState } from './pageState';

describe('pageState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves and loads data back within the same day', () => {
    savePageState('quiz', { topicId: 't1', answer: '왓슨' });
    expect(loadPageState('quiz')).toEqual({ topicId: 't1', answer: '왓슨' });
  });

  it('returns null when nothing has been saved for that key', () => {
    expect(loadPageState('essay')).toBeNull();
  });

  it('discards and returns null for data saved on a previous day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T10:00:00'));
    savePageState('quiz', { answer: '어제 답' });

    vi.setSystemTime(new Date('2026-08-21T10:00:00'));
    expect(loadPageState('quiz')).toBeNull();
    // stale entry should be cleaned up, not just ignored
    expect(localStorage.getItem('quiz')).toBeNull();
  });

  it('clearPageState removes the entry outright', () => {
    savePageState('study', { topicId: 't1' });
    clearPageState('study');
    expect(loadPageState('study')).toBeNull();
  });

  it('does not throw when localStorage.getItem returns malformed JSON', () => {
    localStorage.setItem('quiz', '{not valid json');
    expect(loadPageState('quiz')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- pageState`
Expected: FAIL — `pageState.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/localStorage/pageState.ts
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function savePageState<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ date: todayKey(), data }));
  } catch {
    // localStorage can be unavailable (private mode quota, SSR) — this is a convenience
    // feature, so fail silently rather than breaking the page.
  }
}

export function loadPageState<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date: string; data: T };
    if (parsed.date !== todayKey()) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function clearPageState(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- pageState`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/localStorage/pageState.ts src/lib/localStorage/pageState.test.ts
git commit -m "feat: add pageState localStorage helper for the study page's client-side state"
```

---

### Task 11: `/study` page

**Files:**
- Create: `src/app/study/page.tsx`
- Create: `src/app/study/study.module.css`
- Test: `src/app/study/page.test.tsx`

**Interfaces:**
- Consumes: `groupTopics`/`TopicGroup` (Task 3), `savePageState`/`loadPageState` (Task 10), `TopicRow` (Task 1), `GET /api/books`, `GET /api/topics`, `GET /api/study/[topicId]`, `POST /api/study/[topicId]/explain`, `POST /api/study/[topicId]/practice`, existing `POST /api/attempts`, existing `QuizQuestion` component (`src/app/components/QuizQuestion.tsx`), existing `containsChinese` (`src/lib/containsChinese`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/app/study/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudyPage from './page';

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

const books = [{ id: 'b1', name: '문법' }];
const topics = [
  { id: 'p1', book_id: 'b1', parent_id: null, name: '1장 품사론', start_page: 1, end_page: 20 },
  { id: 'c1', book_id: 'b1', parent_id: 'p1', name: '1절 수사', start_page: 1, end_page: 10 },
];

beforeEach(() => {
  localStorage.clear();
  mockFetch({
    '/api/books': () => ({ ok: true, json: async () => ({ books }) }),
    '/api/topics?bookId=b1': () => ({ ok: true, json: async () => ({ topics }) }),
    '/api/study/c1': () => ({
      ok: true,
      json: async () => ({
        topic: { id: 'c1', name: '1절 수사', startPage: 1, endPage: 10 },
        content: '수사는 명사 앞에 온다',
        explanation: null,
      }),
    }),
    'POST /api/study/c1/explain': () => ({
      ok: true,
      json: async () => ({ explanation: '수사 해설입니다' }),
    }),
    'POST /api/study/c1/practice': () => ({
      ok: true,
      json: async () => ({ id: 'q1', type: 'grammar', prompt: '수사 문제', choices: ['A', 'B'], sourcePage: 5 }),
    }),
    'POST /api/attempts': () => ({ ok: true, json: async () => ({ isCorrect: true }) }),
  });
});

describe('StudyPage', () => {
  it('shows books, then topics after picking a book, then content after picking a topic', async () => {
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');

    expect(await screen.findByText('수사는 명사 앞에 온다')).toBeInTheDocument();
  });

  it('shows a "해설 보기" button when no explanation is cached, and shows the explanation after clicking it', async () => {
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');
    await screen.findByText('수사는 명사 앞에 온다');

    await user.click(screen.getByText('해설 보기'));

    expect(await screen.findByText('수사 해설입니다')).toBeInTheDocument();
  });

  it('generates and answers a practice question scoped to the selected topic', async () => {
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');
    await screen.findByText('수사는 명사 앞에 온다');

    await user.click(screen.getByText('연습문제 풀기'));
    await screen.findByText(/수사 문제/);

    await user.click(screen.getByText('A'));

    await waitFor(() => expect(screen.getByText('정답입니다')).toBeInTheDocument());
  });

  it('shows a hint instead of a dropdown when the selected book has no topics yet', async () => {
    mockFetch({
      '/api/books': () => ({ ok: true, json: async () => ({ books }) }),
      '/api/topics?bookId=b1': () => ({ ok: true, json: async () => ({ topics: [] }) }),
    });
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));

    expect(await screen.findByText('아직 학습 콘텐츠가 준비되지 않았어요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/app/study/page.test.tsx`
Expected: FAIL — `src/app/study/page.tsx` doesn't exist yet.

- [ ] **Step 3: Write the CSS**

```css
/* src/app/study/study.module.css */
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

.error {
  font-size: 12px;
  color: #d64545;
  margin: 8px 0;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0;
}

.bookRow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.bookButton {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  color: var(--foreground);
}

.bookButtonActive {
  background: var(--study-accent);
  border-color: var(--study-accent);
  color: #ffffff;
}

.topicSection {
  margin-bottom: 16px;
}

.label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--card-background);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

.contentCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 14px;
  margin-top: 12px;
}

.contentTitle {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 8px;
}

.contentText {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  margin-bottom: 12px;
}

.explanation {
  font-size: 13px;
  line-height: 1.6;
  background: var(--study-accent-bg);
  color: var(--study-accent-text);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.explainButton {
  background: var(--study-accent);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  margin-bottom: 12px;
}

.practiceButton {
  display: block;
  background: var(--card-background);
  border: 1px solid var(--study-accent);
  color: var(--study-accent-text);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  margin-top: 4px;
}
```

- [ ] **Step 4: Write the page**

```tsx
// src/app/study/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { containsChinese } from '@/lib/containsChinese';
import { loadPageState, savePageState } from '@/lib/localStorage/pageState';
import { groupTopics } from '@/lib/topics/groupTopics';
import QuizQuestion from '../components/QuizQuestion';
import type { QuizFeedback } from '../components/types';
import type { TopicRow } from '@/types/db';
import styles from './study.module.css';

interface Book {
  id: string;
  name: string;
}

interface TopicDetail {
  topic: { id: string; name: string; startPage: number; endPage: number };
  content: string;
  explanation: string | null;
}

interface PracticeQuestion {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

const STUDY_STATE_KEY = 'study-page';

interface StudyState {
  bookId: string;
  topicId: string;
}

export default function StudyPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [bookId, setBookId] = useState('');
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [topicId, setTopicId] = useState('');
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState(false);
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<QuizFeedback | undefined>(undefined);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [practiceSubmitting, setPracticeSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = loadPageState<StudyState>(STUDY_STATE_KEY);
    if (saved) {
      setBookId(saved.bookId ?? '');
      setTopicId(saved.topicId ?? '');
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    savePageState<StudyState>(STUDY_STATE_KEY, { bookId, topicId });
  }, [restored, bookId, topicId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/books');
        if (!res.ok) throw new Error(`books request failed: ${res.status}`);
        const json = await res.json();
        setBooks(json.books);
      } catch (err) {
        console.error(err);
        setBooksError('과목을 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
  }, []);

  useEffect(() => {
    if (!restored || !bookId) {
      setTopics([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/topics?bookId=${bookId}`);
        if (!res.ok) throw new Error(`topics request failed: ${res.status}`);
        const json = await res.json();
        setTopics(json.topics);
      } catch (err) {
        console.error(err);
        setTopicsError('주제를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
  }, [restored, bookId]);

  useEffect(() => {
    if (!restored || !topicId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    setPracticeQuestion(null);
    setPracticeFeedback(undefined);
    setPracticeError(null);
    setPracticeSubmitting(false);
    (async () => {
      try {
        const res = await fetch(`/api/study/${topicId}`);
        if (!res.ok) throw new Error(`study detail request failed: ${res.status}`);
        const json = await res.json();
        setDetail(json);
      } catch (err) {
        console.error(err);
        setDetailError('학습 내용을 불러오지 못했어요. 새로고침 해주세요.');
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [restored, topicId]);

  function selectBook(id: string) {
    setBookId(id);
    setTopicId('');
    setDetail(null);
    setTopicsError(null);
  }

  async function handleExplain() {
    if (!topicId) return;
    setExplaining(true);
    setExplainError(false);
    try {
      const res = await fetch(`/api/study/${topicId}/explain`, { method: 'POST' });
      if (!res.ok) {
        setExplainError(true);
        return;
      }
      const json = await res.json();
      setDetail((prev) => (prev ? { ...prev, explanation: json.explanation } : prev));
    } catch (err) {
      console.error(err);
      setExplainError(true);
    } finally {
      setExplaining(false);
    }
  }

  async function requestPractice() {
    if (!topicId) return;
    setPracticeLoading(true);
    setPracticeError(null);
    try {
      const res = await fetch(`/api/study/${topicId}/practice`, { method: 'POST' });
      if (!res.ok) {
        setPracticeError('연습문제를 만들지 못했어요. 다시 시도해주세요.');
        return;
      }
      const question = (await res.json()) as PracticeQuestion;
      setPracticeQuestion(question);
      setPracticeFeedback(undefined);
    } catch (err) {
      console.error(err);
      setPracticeError('연습문제를 만들지 못했어요. 다시 시도해주세요.');
    } finally {
      setPracticeLoading(false);
    }
  }

  async function submitPractice(questionId: string, answer: string) {
    setPracticeSubmitting(true);
    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswer: answer }),
      });
      if (!res.ok) {
        setPracticeError('채점하지 못했어요. 다시 시도해주세요.');
        return;
      }
      const result = await res.json();
      setPracticeFeedback(
        result.isCorrect ? 'correct' : { explanation: result.explanation, sourcePage: result.sourcePage }
      );
    } catch (err) {
      console.error(err);
      setPracticeError('채점하지 못했어요. 다시 시도해주세요.');
    } finally {
      setPracticeSubmitting(false);
    }
  }

  const groups = groupTopics(topics);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ‹ 홈
      </Link>
      <h1 className={styles.title}>학습하기</h1>

      {booksError && <p className={styles.error}>{booksError}</p>}
      <div className={styles.bookRow}>
        {books.map((b) => (
          <button
            key={b.id}
            className={b.id === bookId ? `${styles.bookButton} ${styles.bookButtonActive}` : styles.bookButton}
            onClick={() => selectBook(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>

      {bookId && (
        <div className={styles.topicSection}>
          <label className={styles.label} htmlFor="study-topic-select">
            주제 선택
          </label>
          {topicsError && <p className={styles.error}>{topicsError}</p>}
          {!topicsError && topics.length === 0 && (
            <p className={styles.hint}>아직 학습 콘텐츠가 준비되지 않았어요.</p>
          )}
          {topics.length > 0 && (
            <select
              id="study-topic-select"
              className={styles.select}
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">주제를 선택하세요</option>
              {groups.map((group) => (
                <optgroup key={group.parent.id} label={group.parent.name}>
                  {group.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      )}

      {detailLoading && <p className={styles.hint}>불러오는 중...</p>}
      {detailError && <p className={styles.error}>{detailError}</p>}

      {detail && (
        <div className={styles.contentCard}>
          <p className={styles.contentTitle}>{detail.topic.name}</p>
          <p className={`${styles.contentText}${containsChinese(detail.content) ? ' zh' : ''}`}>
            {detail.content}
          </p>

          {detail.explanation ? (
            <p className={styles.explanation}>{detail.explanation}</p>
          ) : (
            <button className={styles.explainButton} onClick={handleExplain} disabled={explaining}>
              {explaining ? '불러오는 중...' : '해설 보기'}
            </button>
          )}
          {explainError && <p className={styles.error}>해설을 불러오지 못했어요</p>}

          <button className={styles.practiceButton} onClick={requestPractice} disabled={practiceLoading}>
            {practiceQuestion ? '다른 문제 더 풀기' : '연습문제 풀기'}
          </button>
          {practiceLoading && <p className={styles.hint}>문제 만드는 중...</p>}
          {practiceError && <p className={styles.error}>{practiceError}</p>}

          {practiceQuestion && (
            <QuizQuestion
              question={{
                id: practiceQuestion.id,
                book_id: bookId,
                type: practiceQuestion.type,
                prompt: practiceQuestion.prompt,
                choices: practiceQuestion.choices,
                source_page: practiceQuestion.sourcePage,
              }}
              index={1}
              feedback={practiceFeedback}
              onSubmit={submitPractice}
              submitting={practiceSubmitting}
              lockAfterAnswer
            />
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/app/study/page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/study/page.tsx src/app/study/study.module.css src/app/study/page.test.tsx
git commit -m "feat: add /study page for topic-based study and practice"
```

---

### Task 12: "학습하기" tab on `CoverScreen`

> **SUPERSEDED** — see `docs/superpowers/specs/2026-08-21-nav-card-redesign-design.md`. That
> design replaces `CoverScreen`'s sideways binder-tab row (including this task's planned fifth
> tab) with a flat nav card list, and includes 학습하기 as one of those cards from the start. Do
> not execute this task as written — its entry point is delivered by that spec's own
> implementation plan instead.

**Files:**
- Modify: `src/app/components/CoverScreen.tsx`
- Modify: `src/app/components/session.module.css`
- Modify: `src/app/globals.css`
- Modify: `src/app/components/CoverScreen.test.tsx`

**Interfaces:**
- Produces: a fourth binder tab on the cover screen, linking to `/study` (Task 11).

- [ ] **Step 1: Write the failing test**

Add to `src/app/components/CoverScreen.test.tsx`, after the "third binder tab" test:

```tsx
  it('links to study mode via a fourth binder tab', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText('학습하기').closest('a');
    expect(link).toHaveAttribute('href', '/study');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CoverScreen`
Expected: FAIL — no element with text "학습하기" yet.

- [ ] **Step 3: Add the CSS variables**

Add to `src/app/globals.css`, right after the existing `--quiz-practice-accent-text` line:

```css
  --study-accent: #2e9e6b;
  --study-accent-bg: #e7f6ef;
  --study-accent-text: #1c6b48;
```

- [ ] **Step 4: Update the tab CSS**

In `src/app/components/session.module.css`, change `.quizPracticeTab`'s `border-radius` from
`0 0 8px 0` to `0` (it's no longer the last tab), and add a new `.studyTab` class after it:

```css
.quizPracticeTab {
  display: block;
  box-sizing: content-box;
  background: var(--quiz-practice-accent);
  color: #ffffff;
  border-radius: 0;
  padding: 14px 6px;
  font-size: 12px;
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  white-space: nowrap;
}

.studyTab {
  display: block;
  box-sizing: content-box;
  background: var(--study-accent);
  color: #ffffff;
  border-radius: 0 0 8px 0;
  padding: 14px 6px;
  font-size: 12px;
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  white-space: nowrap;
}
```

- [ ] **Step 5: Add the tab to `CoverScreen`**

In `src/app/components/CoverScreen.tsx`, add a fourth `Link` right after the `quizPracticeTab` one:

```tsx
        <Link href="/quiz-practice" className={styles.quizPracticeTab}>
          더 풀기
        </Link>
        <Link href="/study" className={styles.studyTab}>
          학습하기
        </Link>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- CoverScreen`
Expected: PASS (all `CoverScreen` tests, including the new one)

- [ ] **Step 7: Commit**

```bash
git add src/app/components/CoverScreen.tsx src/app/components/session.module.css \
  src/app/globals.css src/app/components/CoverScreen.test.tsx
git commit -m "feat: add 학습하기 tab to the cover screen"
```

---

## After all tasks

1. Run the full suite: `npm test` and `npx tsc --noEmit` — confirm nothing else broke.
2. Run the migration manually in the Supabase SQL Editor (`supabase/migrations/0003_topics.sql`).
3. For each of the 4 books, find its real TOC page range and run:
   `npm run ingest:topics -- <bookId> <tocStartPage> <tocEndPage>`, then spot-check a few
   `start_page` values against the book's actual pages (see Task 6's operational note).
4. Manually verify `/study` end-to-end in the browser: pick each book, pick a few topics, view
   content, generate an explanation (and reload to confirm it's cached, not regenerated), generate
   and answer a practice question, and confirm it shows up afterward in 오답노트/더 풀기.
