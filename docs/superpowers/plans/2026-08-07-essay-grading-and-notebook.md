# 서술형 채점 개편 + 서술형 노트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 0–100 dual-score essay grading with the real exam's 4-point concept-coverage
model (grammar surfaced as sentence-level corrections instead of a score deduction), and add a
"서술형 노트" binder tab for reviewing every past essay attempt and generating new practice
questions on demand.

**Architecture:** `gradeEssay` is rewritten to return a concept checklist (AI-derived, scored by
counting `covered: true` entries) plus a grammar-corrections array; `recordEssayAttempt` persists
both to two new `attempts` columns. A new `src/lib/essay/` module pairs a pure data function
(`generateEssayPractice`, `getEssayNotes`) with a thin API route each, mirroring the existing
`src/lib/notebook/` pattern. A new `/essay-notes` page reuses the existing `EssayQuestion`
component and the existing `POST /api/attempts/essay` endpoint for submission — no new answer path.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, CSS Modules, Vitest + Testing Library —
same stack as the rest of the app, no new dependencies.

## Global Constraints

- No new npm dependencies.
- All user-facing text is Korean; grammar-correction and concept-checklist copy follows the app's
  existing tone.
- Follow the existing CSS Modules pattern: shared question/session-card styles live in
  `src/app/components/session.module.css`; a new page gets its own co-located `*.module.css`.
- This codebase does not unit-test API route handlers directly — routes stay thin and are
  exercised through page-level integration tests that mock `fetch`, matching
  `src/app/page.test.tsx` and the notebook feature's convention. Do not add `route.test.ts` files.
- Chinese text rendered anywhere in the UI must use the `zh` global CSS class (added in a prior
  change to `src/app/globals.css`, backed by Noto Sans SC) so it doesn't inherit Pretendard's
  Korean-leaning Han glyph shapes.
- The `supabase/migrations/0002_essay_concept_grading.sql` file this plan adds is **not** applied
  automatically by anything in this repo or its test suite — it must be run manually in the
  Supabase SQL Editor before the new columns are used in production, the same way the project's
  existing `service_role` grants were applied manually.

---

### Task 1: `gradeEssay` concept-coverage rewrite + migration

**Files:**
- Create: `supabase/migrations/0002_essay_concept_grading.sql`
- Modify: `src/lib/ai/gradeEssay.ts`
- Test: `src/lib/ai/gradeEssay.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `askClaude`, `parseJsonResponse` from `./client` (unchanged).
- Produces (used by Task 2):
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
    conceptScore: number; // 0-4, computed by counting covered concepts — never trust an AI-reported total
    conceptChecklist: ConceptCheck[]; // length 4
    grammarCorrections: GrammarCorrection[]; // empty array when no issues found
  }
  export async function gradeEssay(client: Anthropic, input: EssayGradeInput): Promise<EssayGradeResult>
  ```
  `EssayGradeInput` is unchanged from the current file (`bookName`, `pages`, `questionPrompt`,
  `koreanDraft`, `chineseAnswer`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_essay_concept_grading.sql`:

```sql
-- supabase/migrations/0002_essay_concept_grading.sql
alter table attempts add column concept_score integer;
alter table attempts add column concept_checklist jsonb;
alter table attempts add column grammar_corrections jsonb;

alter table questions alter column session_id drop not null;
```

This is additive only — `content_score`/`chinese_score` stay in place (existing rows untouched),
and `questions.session_id` becomes nullable so Task 4's on-demand practice questions (not tied to
any `daily_sessions` row) can be inserted.

- [ ] **Step 2: Write the failing tests**

Replace the full contents of `src/lib/ai/gradeEssay.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { gradeEssay } from './gradeEssay';

describe('gradeEssay', () => {
  it('computes conceptScore as the count of covered concepts', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                conceptChecklist: [
                  { concept: '루쉰의 사실주의 기법', covered: true },
                  { concept: '광인일기의 상징', covered: false },
                  { concept: '봉건 사회 비판', covered: true },
                  { concept: '백화문 사용', covered: true },
                ],
                grammarCorrections: [],
              }),
            },
          ],
        }),
      },
    } as any;

    const result = await gradeEssay(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '루쉰의 광인일기...' }],
      questionPrompt: '루쉰 문학의 특징을 서술하시오',
      koreanDraft: '루쉰은 사실주의 기법으로...',
      chineseAnswer: '鲁迅用现实主义手法...',
    });

    expect(result.conceptScore).toBe(3);
    expect(result.conceptChecklist).toHaveLength(4);
    expect(result.grammarCorrections).toEqual([]);
  });

  it('includes grammar corrections with original, corrected, and explanation', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                conceptChecklist: [
                  { concept: 'A', covered: true },
                  { concept: 'B', covered: true },
                  { concept: 'C', covered: true },
                  { concept: 'D', covered: true },
                ],
                grammarCorrections: [
                  {
                    original: '我很高兴认识你们大家',
                    corrected: '我很高兴认识大家',
                    explanation: '你们과 大家를 같이 쓰지 않아요',
                  },
                ],
              }),
            },
          ],
        }),
      },
    } as any;

    const result = await gradeEssay(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '내용' }],
      questionPrompt: '질문',
      koreanDraft: '초안',
      chineseAnswer: '我很高兴认识你们大家',
    });

    expect(result.grammarCorrections).toEqual([
      {
        original: '我很高兴认识你们大家',
        corrected: '我很高兴认识大家',
        explanation: '你们과 大家를 같이 쓰지 않아요',
      },
    ]);
  });

  it('includes both the Korean draft and Chinese answer in the prompt sent to Claude', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text:
                '{"conceptChecklist":[{"concept":"A","covered":false},{"concept":"B","covered":false},' +
                '{"concept":"C","covered":false},{"concept":"D","covered":false}],"grammarCorrections":[]}',
            },
          ],
        }),
      },
    } as any;

    await gradeEssay(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '내용' }],
      questionPrompt: '질문',
      koreanDraft: '한국어 초안 내용',
      chineseAnswer: '中文答案内容',
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('한국어 초안 내용');
    expect(sentPrompt).toContain('中文答案内容');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- gradeEssay`
Expected: FAIL — `result.conceptScore` is `undefined` (current implementation returns
`contentScore`/`chineseScore`, not this shape).

- [ ] **Step 4: Rewrite `gradeEssay.ts`**

Replace the full contents of `src/lib/ai/gradeEssay.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, parseJsonResponse } from './client';

export interface EssayGradeInput {
  bookName: string;
  pages: { pageNum: number; content: string }[];
  questionPrompt: string;
  koreanDraft: string;
  chineseAnswer: string;
}

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
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
}

interface RawEssayGrade {
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
}

export async function gradeEssay(client: Anthropic, input: EssayGradeInput): Promise<EssayGradeResult> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');

  const prompt =
    `아래는 "${input.bookName}" 교재 발췌와 서술형 문제, 사용자의 2단계 답안입니다.\n` +
    `문제: ${input.questionPrompt}\n\n` +
    `1단계(한국어 내용 정리): ${input.koreanDraft}\n` +
    `2단계(중국어 답안): ${input.chineseAnswer}\n\n` +
    `교재 발췌:\n${pageText}\n\n` +
    `먼저 교재 발췌 내용을 근거로, 이 문제에 대한 완전한 답안이 반드시 포함해야 할 핵심 개념 4개를 뽑으세요. ` +
    `그다음 사용자의 중국어 답안(2단계)이 각 개념을 담고 있는지 하나씩 판단하세요. ` +
    `마지막으로, 중국어 답안의 문법/표현상 어색하거나 틀린 문장을 찾아 자연스럽게 고친 버전과 짧은 한국어 ` +
    `설명을 제시하세요 (문제 없으면 빈 배열).\n\n` +
    `다음 JSON 형식으로만 응답하세요: ` +
    `{"conceptChecklist":[{"concept":"...","covered":true},{"concept":"...","covered":false},` +
    `{"concept":"...","covered":true},{"concept":"...","covered":true}],` +
    `"grammarCorrections":[{"original":"...","corrected":"...","explanation":"..."}]}`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 서술형 채점관입니다. 반드시 주어진 교재 내용에 근거해 채점하세요. ' +
      '실제 임용고시처럼 개념 커버리지로 채점하고, 문법 오류는 점수에 반영하지 말고 별도로 교정문을 ' +
      '제시하세요. 중국어 예문이나 표현을 인용할 때는 반드시 간체자(简体字)로만 작성하세요. ' +
      '번체자(繁體字)는 절대 사용하지 마세요.',
    maxTokens: 1024,
  });

  const parsed = parseJsonResponse<RawEssayGrade>(raw);
  const conceptScore = parsed.conceptChecklist.filter((c) => c.covered).length;

  return {
    conceptScore,
    conceptChecklist: parsed.conceptChecklist,
    grammarCorrections: parsed.grammarCorrections,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- gradeEssay`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0002_essay_concept_grading.sql src/lib/ai/gradeEssay.ts src/lib/ai/gradeEssay.test.ts
git commit -m "feat: grade essays by concept-coverage instead of 0-100 dual score"
```

---

### Task 2: `recordEssayAttempt` + `AttemptRow` type update

**Files:**
- Modify: `src/lib/attempts/recordEssayAttempt.ts`
- Modify: `src/types/db.ts`
- Test: `src/lib/attempts/recordEssayAttempt.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `gradeEssay(client, input): Promise<EssayGradeResult>` from Task 1 (`conceptScore`,
  `conceptChecklist`, `grammarCorrections`).
- Produces: `recordEssayAttempt` still returns exactly what `gradeEssay` returns (the
  `EssayGradeResult`), consumed unchanged by `POST /api/attempts/essay` and, later, by Task 3's UI.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/lib/attempts/recordEssayAttempt.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { recordEssayAttempt } from './recordEssayAttempt';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { gradeEssay } from '../ai/gradeEssay';

vi.mock('../ai/gradeEssay', () => ({
  gradeEssay: vi.fn().mockResolvedValue({
    conceptScore: 3,
    conceptChecklist: [
      { concept: '개념1', covered: true },
      { concept: '개념2', covered: false },
      { concept: '개념3', covered: true },
      { concept: '개념4', covered: true },
    ],
    grammarCorrections: [{ original: '错误句子', corrected: '正确句子', explanation: '설명' }],
  }),
}));

function baseTables() {
  return {
    questions: [
      { id: 'q1', book_id: 'b1', source_page: 30, prompt: '루쉰 문학의 특징을 서술하시오' },
    ],
    books: [{ id: 'b1', name: '중국문학사' }],
    book_pages: [{ book_id: 'b1', page_num: 30, content: '루쉰의 광인일기' }],
    attempts: [],
  };
}

describe('recordEssayAttempt', () => {
  it('saves the concept score, checklist, and grammar corrections', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await recordEssayAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      koreanDraft: '루쉰은 사실주의 기법으로...',
      chineseAnswer: '鲁迅用现实主义手法...',
    });

    expect(result.conceptScore).toBe(3);
    expect(supabase.inserted.attempts[0]).toMatchObject({
      question_id: 'q1',
      korean_draft: '루쉰은 사실주의 기법으로...',
      chinese_answer: '鲁迅用现实主义手法...',
      concept_score: 3,
      concept_checklist: [
        { concept: '개념1', covered: true },
        { concept: '개념2', covered: false },
        { concept: '개념3', covered: true },
        { concept: '개념4', covered: true },
      ],
      grammar_corrections: [{ original: '错误句子', corrected: '正确句子', explanation: '설명' }],
    });
  });

  it('passes the real book name to the grader instead of an empty string', async () => {
    const supabase = createMockSupabase(baseTables());

    await recordEssayAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      koreanDraft: '초안',
      chineseAnswer: '答案',
    });

    expect(gradeEssay).toHaveBeenCalledWith(
      {} as any,
      expect.objectContaining({ bookName: '중국문학사' })
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- recordEssayAttempt`
Expected: FAIL — `supabase.inserted.attempts[0]` still has `content_score`/`chinese_score`, not
`concept_score`/`concept_checklist`/`grammar_corrections`.

- [ ] **Step 3: Update `AttemptRow` in `src/types/db.ts`**

Add these two interfaces and update `AttemptRow` (insert both new interfaces above
`AttemptRow`, then add the three new fields to the interface body):

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

export interface AttemptRow {
  id: string;
  question_id: string;
  user_answer: string | null;
  is_correct: boolean | null;
  explanation: string | null;
  korean_draft: string | null;
  chinese_answer: string | null;
  content_score: number | null;
  chinese_score: number | null;
  ai_feedback: string | null;
  concept_score: number | null;
  concept_checklist: ConceptCheck[] | null;
  grammar_corrections: GrammarCorrection[] | null;
}
```

- [ ] **Step 4: Update `recordEssayAttempt.ts`**

In `src/lib/attempts/recordEssayAttempt.ts`, replace the `attempts` insert call:

```ts
  const { error: attemptError } = await (supabase.from('attempts') as any).insert({
    question_id: question.id,
    korean_draft: input.koreanDraft,
    chinese_answer: input.chineseAnswer,
    concept_score: grade.conceptScore,
    concept_checklist: grade.conceptChecklist,
    grammar_corrections: grade.grammarCorrections,
  });
```

(This replaces the previous insert that wrote `content_score`/`chinese_score`/`ai_feedback` — the
rest of the function, including the `gradeEssay` call and the `return grade;` at the end, is
unchanged.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- recordEssayAttempt`
Expected: PASS (2/2). Also run `npx tsc --noEmit` to confirm the `AttemptRow` change didn't break
any other file that reads `content_score`/`chinese_score` (none currently do outside this file).

- [ ] **Step 6: Commit**

```bash
git add src/lib/attempts/recordEssayAttempt.ts src/lib/attempts/recordEssayAttempt.test.ts src/types/db.ts
git commit -m "feat: persist concept-checklist essay grades instead of dual scores"
```

---

### Task 3: `EssayQuestion` feedback UI + shared types + daily-session test update

**Files:**
- Modify: `src/app/components/types.ts`
- Modify: `src/app/components/EssayQuestion.tsx`
- Modify: `src/app/components/session.module.css`
- Modify: `src/app/components/EssayQuestion.test.tsx`
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `EssayGradeResult`-shaped JSON from `POST /api/attempts/essay` (unchanged endpoint,
  now returning the new shape from Task 2).
- Produces:
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
  export interface EssayFeedback {
    conceptScore: number;
    conceptChecklist: ConceptCheck[];
    grammarCorrections: GrammarCorrection[];
  }
  ```
  consumed by `src/app/page.tsx` (unchanged — it only threads `EssayFeedback` through, never reads
  its fields directly) and by Task 7's `/essay-notes` page.

- [ ] **Step 1: Write the failing tests**

Replace the two score-related tests in `src/app/components/EssayQuestion.test.tsx` — keep the
first three tests (`renders a badge and both step labels`, `calls the change handlers...`,
`calls onSubmit...`) exactly as they are, and replace only the last test
(`shows separate content and Chinese scores when feedback is present`) with:

```tsx
  it('shows the concept checklist and total score when feedback is present', () => {
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={{
          conceptScore: 3,
          conceptChecklist: [
            { concept: '주제 설명', covered: true },
            { concept: '평언 설명', covered: false },
            { concept: '관계 설명', covered: true },
            { concept: '예시 제시', covered: true },
          ],
          grammarCorrections: [],
        }}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('3/4점')).toBeInTheDocument();
    expect(screen.getByText(/주제 설명/)).toBeInTheDocument();
    expect(screen.getByText(/평언 설명/)).toBeInTheDocument();
  });

  it('shows grammar corrections with the original, corrected sentence, and explanation', () => {
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={{
          conceptScore: 4,
          conceptChecklist: [
            { concept: 'A', covered: true },
            { concept: 'B', covered: true },
            { concept: 'C', covered: true },
            { concept: 'D', covered: true },
          ],
          grammarCorrections: [
            {
              original: '我很高兴认识你们大家',
              corrected: '我很高兴认识大家',
              explanation: '你们과 大家를 같이 쓰지 않아요',
            },
          ],
        }}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('我很高兴认识你们大家')).toBeInTheDocument();
    expect(screen.getByText('我很高兴认识大家')).toBeInTheDocument();
    expect(screen.getByText(/你们과 大家를 같이 쓰지 않아요/)).toBeInTheDocument();
  });
```

Also update `src/app/page.test.tsx`: replace the `/api/attempts/essay` mock handler (both places
it appears — the `beforeEach` block and the essay-submission test) from
`{ contentScore: 75, chineseScore: 55, feedback: '표현 개선 필요' }` to:

```ts
{
  conceptScore: 3,
  conceptChecklist: [
    { concept: '루쉰의 사실주의 기법', covered: true },
    { concept: '광인일기의 상징', covered: false },
    { concept: '봉건 사회 비판', covered: true },
    { concept: '백화문 사용', covered: true },
  ],
  grammarCorrections: [],
}
```

And replace the test body `it('submits the two-stage essay answer and shows separate content/Chinese scores', ...)`
with:

```tsx
  it('submits the two-stage essay answer and shows the concept checklist score', async () => {
    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));

    const koreanBox = await screen.findByLabelText(/1단계/);
    const chineseBox = await screen.findByLabelText(/2단계/);
    await user.type(koreanBox, '루쉰은 사실주의 기법으로...');
    await user.type(chineseBox, '鲁迅用现实主义手法...');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText('3/4점')).toBeInTheDocument());
    expect(screen.getByText(/루쉰의 사실주의 기법/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- EssayQuestion` and `npm test -- page.test`
Expected: both FAIL — `EssayFeedback`'s type doesn't have `conceptScore` yet, and the component
still renders the old two-score line.

- [ ] **Step 3: Update `EssayFeedback` in `src/app/components/types.ts`**

Replace the existing `EssayFeedback` interface (and the two new interfaces above it):

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

export interface EssayFeedback {
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
}
```

- [ ] **Step 4: Add the feedback styles**

In `src/app/components/session.module.css`, add after the existing `.essayFeedback` rule:

```css
.essayScoreLine {
  font-size: 14px;
  font-weight: 700;
  margin-top: 4px;
  margin-bottom: 6px;
}

.conceptChecklist {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.conceptCovered {
  font-size: 12px;
  color: var(--accent);
}

.conceptMissing {
  font-size: 12px;
  color: var(--text-secondary);
}

.grammarList {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grammarItem {
  background: var(--background);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 8px 10px;
}

.grammarOriginal {
  font-size: 12px;
  color: var(--text-secondary);
  text-decoration: line-through;
}

.grammarArrow {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 6px;
}

.grammarCorrected {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.grammarExplanation {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}
```

- [ ] **Step 5: Replace the feedback rendering in `EssayQuestion.tsx`**

Replace the final block of `src/app/components/EssayQuestion.tsx` (the `{feedback && (...)}` part
at the end of the returned JSX, right before the closing `</div>`):

```tsx
      {feedback && (
        <div className={styles.essayFeedback}>
          <p className={styles.essayScoreLine}>{feedback.conceptScore}/4점</p>
          <ul className={styles.conceptChecklist}>
            {feedback.conceptChecklist.map((c, i) => (
              <li key={i} className={c.covered ? styles.conceptCovered : styles.conceptMissing}>
                {c.covered ? '✓' : '✗'} {c.concept}
              </li>
            ))}
          </ul>
          {feedback.grammarCorrections.length > 0 && (
            <ul className={styles.grammarList}>
              {feedback.grammarCorrections.map((g, i) => (
                <li key={i} className={styles.grammarItem}>
                  <span className={`${styles.grammarOriginal} zh`}>{g.original}</span>
                  <span className={styles.grammarArrow}>→</span>
                  <span className={`${styles.grammarCorrected} zh`}>{g.corrected}</span>
                  <p className={styles.grammarExplanation}>{g.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- EssayQuestion` and `npm test -- page.test`
Expected: both PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/components/types.ts src/app/components/EssayQuestion.tsx src/app/components/session.module.css src/app/components/EssayQuestion.test.tsx src/app/page.test.tsx
git commit -m "feat: render concept checklist and grammar corrections in EssayQuestion feedback"
```

---

### Task 4: Essay-in-Chinese generation instruction + on-demand practice questions

**Files:**
- Modify: `src/lib/ai/generateQuestions.ts`
- Modify: `src/lib/ai/generateQuestions.test.ts`
- Create: `src/lib/essay/generateEssayPractice.ts`
- Test: `src/lib/essay/generateEssayPractice.test.ts`
- Create: `src/app/api/essay-notes/new/route.ts`

**Interfaces:**
- Consumes: `generateQuestions(client, input): Promise<GeneratedQuestion[]>` (existing, only its
  prompt changes); `SupabaseClient`, `Anthropic` clients.
- Produces (used by Task 7):
  ```ts
  export interface GenerateEssayPracticeInput {
    bookId: string;
  }
  export interface EssayPracticeQuestion {
    id: string;
    prompt: string;
    sourcePage: number;
  }
  export async function generateEssayPractice(
    supabase: SupabaseClient,
    aiClient: Anthropic,
    input: GenerateEssayPracticeInput
  ): Promise<EssayPracticeQuestion>
  ```
  `POST /api/essay-notes/new` → body `{ bookId: string }` → `200 EssayPracticeQuestion` on success,
  `500 { error: string }` on failure.

- [ ] **Step 1: Write the failing test for the Chinese-language instruction**

Add to `src/lib/ai/generateQuestions.test.ts` (inside the existing `describe` block):

```ts
  it('instructs the essay prompt to be written in Chinese when essay is among the requested types', async () => {
    const client = fakeClientReturning('[]');

    await generateQuestions(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '내용' }],
      types: ['essay'],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('중국어로 출제');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- generateQuestions`
Expected: FAIL — the current prompt never mentions "중국어로 출제".

- [ ] **Step 3: Add the essay-language instruction to `generateQuestions.ts`**

In `src/lib/ai/generateQuestions.ts`, modify the `generateQuestions` function body — add the
`essayInstruction` line and append it to the prompt:

```ts
export async function generateQuestions(
  client: Anthropic,
  input: QuestionGenInput
): Promise<GeneratedQuestion[]> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');
  const referenceText = input.referenceExcerpts?.length
    ? `\n\n실제 기출문제 스타일 참고:\n${input.referenceExcerpts.join('\n---\n')}`
    : '';
  const essayInstruction = input.types.includes('essay')
    ? '\n\nessay 유형 문제의 prompt는 반드시 중국어로 출제하세요 (실제 임용고시 서술형 문제는 중국어로 제시됩니다).'
    : '';

  const prompt =
    `다음은 "${input.bookName}" 교재의 일부 발췌입니다. 이 내용만을 근거로 ` +
    `${input.types.join(', ')} 유형의 문제를 각 1개씩 만들어주세요. ` +
    `각 문제는 반드시 아래 JSON 배열 형식으로만 응답하세요:\n` +
    `[{"type":"grammar","sourcePage":12,"prompt":"...","choices":["...","..."],"correctAnswer":"..."}]\n\n` +
    `교재 발췌:\n${pageText}${referenceText}${essayInstruction}`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 출제 위원입니다. 반드시 주어진 교재 내용에만 근거해 문제를 냅니다. ' +
      '중국어 텍스트는 반드시 간체자(简体字)로만 작성하세요. 번체자(繁體字)는 절대 사용하지 마세요.',
    maxTokens: 2048,
  });

  return parseJsonResponse<GeneratedQuestion[]>(raw);
}
```

(The system prompt shown here already has the 간체자 instruction from a prior change — only the
`essayInstruction` line and its use in `prompt` are new.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- generateQuestions`
Expected: PASS (3/3).

- [ ] **Step 5: Write the failing tests for `generateEssayPractice`**

Create `src/lib/essay/generateEssayPractice.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateEssayPractice } from './generateEssayPractice';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { generateQuestions } from '../ai/generateQuestions';

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn().mockResolvedValue([
    { type: 'essay', sourcePage: 5, prompt: '这篇课文的主题是什么？', correctAnswer: '' },
  ]),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', current_page: 10 }],
    book_pages: [
      { book_id: 'b1', page_num: 1, content: '내용1' },
      { book_id: 'b1', page_num: 5, content: '내용5' },
      { book_id: 'b1', page_num: 10, content: '내용10' },
    ],
    questions: [],
    ...overrides,
  };
}

describe('generateEssayPractice', () => {
  it('generates a new essay question from a page within the read range and stores it with no session', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateEssayPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('这篇课文的主题是什么？');
    expect(supabase.inserted.questions[0]).toMatchObject({
      book_id: 'b1',
      session_id: null,
      type: 'essay',
    });
    randomSpy.mockRestore();
  });

  it('retries with a different page when the first random page has no content, then succeeds', async () => {
    const supabase = createMockSupabase(
      baseTables({ book_pages: [{ book_id: 'b1', page_num: 10, content: '내용10' }] })
    );
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05); // -> page 1, missing from book_pages
    randomSpy.mockReturnValueOnce(0.95); // -> page 10, present

    const result = await generateEssayPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('这篇课文的主题是什么？');
    randomSpy.mockRestore();
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      generateEssayPractice(supabase as any, {} as any, { bookId: 'missing' })
    ).rejects.toThrow('Book not found');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test -- generateEssayPractice`
Expected: FAIL with "Cannot find module './generateEssayPractice'".

- [ ] **Step 7: Implement `generateEssayPractice.ts`**

Create `src/lib/essay/generateEssayPractice.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { generateQuestions } from '../ai/generateQuestions';

export interface GenerateEssayPracticeInput {
  bookId: string;
}

export interface EssayPracticeQuestion {
  id: string;
  prompt: string;
  sourcePage: number;
}

function randomPage(maxPage: number): number {
  return Math.floor(Math.random() * maxPage) + 1;
}

export async function generateEssayPractice(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateEssayPracticeInput
): Promise<EssayPracticeQuestion> {
  const { data: book } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', input.bookId)
    .single();
  if (!book) throw new Error('Book not found');

  const maxPage = Math.max(1, book.current_page);

  let page: { page_num: number; content: string } | null = null;
  for (let attempt = 0; attempt < 2 && !page; attempt++) {
    const pageNum = randomPage(maxPage);
    const { data } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', input.bookId)
      .eq('page_num', pageNum)
      .maybeSingle();
    page = data;
  }
  if (!page) throw new Error('No page content found for essay practice');

  const [generated] = await generateQuestions(aiClient, {
    bookName: book.name,
    pages: [{ pageNum: page.page_num, content: page.content }],
    types: ['essay'],
  });

  const { data: inserted, error } = await (supabase.from('questions') as any)
    .insert({
      book_id: input.bookId,
      session_id: null,
      type: 'essay',
      source_page: generated.sourcePage,
      prompt: generated.prompt,
      choices: null,
      correct_answer: generated.correctAnswer,
      used_reference: false,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to insert essay practice question: ${error.message}`);

  return { id: inserted.id, prompt: inserted.prompt, sourcePage: inserted.source_page };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- generateEssayPractice`
Expected: PASS (3/3).

- [ ] **Step 9: Implement the route**

Create `src/app/api/essay-notes/new/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { generateEssayPractice } from '@/lib/essay/generateEssayPractice';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { bookId: string };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const question = await generateEssayPractice(supabase, getAnthropicClient(), body);
    return NextResponse.json(question);
  } catch (err) {
    console.error('[POST /api/essay-notes/new] failed:', err);
    return NextResponse.json({ error: '새 서술형 문제를 만들지 못했어요' }, { status: 500 });
  }
}
```

- [ ] **Step 10: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/lib/ai/generateQuestions.ts src/lib/ai/generateQuestions.test.ts src/lib/essay/generateEssayPractice.ts src/lib/essay/generateEssayPractice.test.ts src/app/api/essay-notes/new/route.ts
git commit -m "feat: generate essay questions in Chinese and support on-demand practice questions"
```

---

### Task 5: `getEssayNotes` + list route

**Files:**
- Create: `src/lib/essay/getEssayNotes.ts`
- Test: `src/lib/essay/getEssayNotes.test.ts`
- Create: `src/app/api/essay-notes/route.ts`

**Interfaces:**
- Consumes: `ConceptCheck`, `GrammarCorrection` from `@/types/db` (Task 2).
- Produces (used by Task 7):
  ```ts
  export interface EssayNote {
    id: string;
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
  `GET /api/essay-notes` → `200 { notes: EssayNote[], books: { id: string; name: string }[] }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/essay/getEssayNotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getEssayNotes } from './getEssayNotes';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    attempts: [],
    questions: [],
    books: [{ id: 'b1', name: '문학개론' }],
    ...overrides,
  };
}

describe('getEssayNotes', () => {
  it('returns an essay attempt with its concept checklist and book name', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '鲁迅文学的特点是什么？' }],
        attempts: [
          {
            id: 'a1',
            question_id: 'q1',
            korean_draft: '초안',
            chinese_answer: '鲁迅用现实主义手法...',
            concept_score: 3,
            concept_checklist: [
              { concept: '사실주의 기법', covered: true },
              { concept: '광인일기의 상징', covered: false },
              { concept: '봉건 사회 비판', covered: true },
              { concept: '백화문 사용', covered: true },
            ],
            grammar_corrections: [],
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: 'a1',
      questionPrompt: '鲁迅文学的特点是什么？',
      bookName: '문학개론',
      conceptScore: 3,
    });
  });

  it('includes an attempt with a score of 0 — no filtering by score', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '질문' }],
        attempts: [
          {
            id: 'a1',
            question_id: 'q1',
            korean_draft: '',
            chinese_answer: '',
            concept_score: 0,
            concept_checklist: [
              { concept: 'A', covered: false },
              { concept: 'B', covered: false },
              { concept: 'C', covered: false },
              { concept: 'D', covered: false },
            ],
            grammar_corrections: [],
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes).toHaveLength(1);
    expect(notes[0].conceptScore).toBe(0);
  });

  it('excludes quiz attempts (no concept_score) even for the same question type table', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '문제' }],
        attempts: [
          {
            id: 'a1',
            question_id: 'q1',
            is_correct: true,
            concept_score: null,
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes).toHaveLength(0);
  });

  it('sorts notes newest first', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '문제' }],
        attempts: [
          {
            id: 'old',
            question_id: 'q1',
            concept_score: 1,
            concept_checklist: [],
            grammar_corrections: [],
            created_at: '2026-08-01T00:00:00Z',
          },
          {
            id: 'new',
            question_id: 'q1',
            concept_score: 2,
            concept_checklist: [],
            grammar_corrections: [],
            created_at: '2026-08-05T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes.map((n) => n.id)).toEqual(['new', 'old']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- getEssayNotes`
Expected: FAIL with "Cannot find module './getEssayNotes'".

- [ ] **Step 3: Implement `getEssayNotes.ts`**

Create `src/lib/essay/getEssayNotes.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConceptCheck, GrammarCorrection } from '@/types/db';

export interface EssayNote {
  id: string;
  questionPrompt: string;
  bookName: string;
  koreanDraft: string;
  chineseAnswer: string;
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
  createdAt: string;
}

export async function getEssayNotes(supabase: SupabaseClient): Promise<EssayNote[]> {
  const { data: attempts } = await (supabase.from('attempts') as any).select('*');
  const { data: questions } = await (supabase.from('questions') as any).select('*');
  const { data: books } = await (supabase.from('books') as any).select('*');

  const questionById = new Map((questions ?? []).map((q: any) => [q.id, q]));
  const bookNameById = new Map((books ?? []).map((b: any) => [b.id, b.name]));

  const notes: EssayNote[] = [];
  for (const attempt of attempts ?? []) {
    if (attempt.concept_score === null || attempt.concept_score === undefined) continue;
    const question = questionById.get(attempt.question_id);
    if (!question) continue;

    notes.push({
      id: attempt.id,
      questionPrompt: question.prompt,
      bookName: bookNameById.get(question.book_id) ?? '',
      koreanDraft: attempt.korean_draft ?? '',
      chineseAnswer: attempt.chinese_answer ?? '',
      conceptScore: attempt.concept_score,
      conceptChecklist: attempt.concept_checklist ?? [],
      grammarCorrections: attempt.grammar_corrections ?? [],
      createdAt: attempt.created_at,
    });
  }

  notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return notes;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- getEssayNotes`
Expected: PASS (4/4).

- [ ] **Step 5: Implement the route**

Create `src/app/api/essay-notes/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEssayNotes } from '@/lib/essay/getEssayNotes';

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const notes = await getEssayNotes(supabase);
    const { data: books } = await supabase.from('books').select('id, name');
    return NextResponse.json({ notes, books: books ?? [] });
  } catch (err) {
    console.error('[GET /api/essay-notes] failed:', err);
    return NextResponse.json({ error: '서술형 노트를 불러오지 못했어요' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/essay/getEssayNotes.ts src/lib/essay/getEssayNotes.test.ts src/app/api/essay-notes/route.ts
git commit -m "feat: add GET /api/essay-notes listing all past essay attempts"
```

---

### Task 6: "서술형 노트" tab on `CoverScreen`

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/components/session.module.css`
- Modify: `src/app/components/CoverScreen.tsx`
- Modify: `src/app/components/CoverScreen.test.tsx`

**Interfaces:**
- Consumes: `next/link`'s `Link` (already used by the existing 오답노트 tab).
- Produces: no new exports — a second tab added to `CoverScreen`, alongside the existing
  오답노트 tab (which links to `/notebook`).

- [ ] **Step 1: Write the failing test**

Add to `src/app/components/CoverScreen.test.tsx` (inside the existing `describe` block, after the
existing 오답노트 tab test):

```tsx
  it('links to the essay notebook via a second binder tab', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText('서술형 노트').closest('a');
    expect(link).toHaveAttribute('href', '/essay-notes');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CoverScreen`
Expected: FAIL — no element with text "서술형 노트" exists yet.

- [ ] **Step 3: Add the purple accent tokens**

In `src/app/globals.css`, add inside the existing `:root { ... }` block, after
`--notebook-accent-text`:

```css
  --essay-notes-accent: #7c6bb0;
  --essay-notes-accent-bg: #f0eef8;
  --essay-notes-accent-text: #4f4380;
```

- [ ] **Step 4: Reposition the existing tab and add the new one**

In `src/app/components/session.module.css`, the existing `.notebookTab` rule currently reads:

```css
.notebookTab {
  position: absolute;
  right: -20px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--notebook-accent);
  color: #ffffff;
  border-radius: 0 8px 8px 0;
  padding: 14px 6px;
  font-size: 12px;
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}
```

Change `top: 50%;` to `top: 38%;` so it no longer sits at dead center, then add a second rule
right after it:

```css
.essayNotesTab {
  position: absolute;
  right: -20px;
  top: 62%;
  transform: translateY(-50%);
  background: var(--essay-notes-accent);
  color: #ffffff;
  border-radius: 0 8px 8px 0;
  padding: 14px 6px;
  font-size: 12px;
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}
```

- [ ] **Step 5: Add the `Link` to `CoverScreen`**

In `src/app/components/CoverScreen.tsx`, add a second `Link` right after the existing 오답노트
one:

```tsx
      <Link href="/notebook" className={styles.notebookTab}>
        오답노트
      </Link>
      <Link href="/essay-notes" className={styles.essayNotesTab}>
        서술형 노트
      </Link>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- CoverScreen`
Expected: PASS (4/4).

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/components/session.module.css src/app/components/CoverScreen.tsx src/app/components/CoverScreen.test.tsx
git commit -m "feat: add essay-notebook binder tab to the cover screen"
```

---

### Task 7: `/essay-notes` page

**Files:**
- Create: `src/app/essay-notes/page.tsx`
- Create: `src/app/essay-notes/essay-notes.module.css`
- Create: `src/app/essay-notes/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/essay-notes` (Task 5) → `{ notes: EssayNote[], books: {id,name}[] }`;
  `POST /api/essay-notes/new` (Task 4) → `{ id, prompt, sourcePage }`; the existing
  `POST /api/attempts/essay` → `EssayGradeResult`-shaped JSON (unchanged endpoint, new shape from
  Task 2); `EssayQuestion` component (Task 3) with its `EssayFeedback` prop type.
- Produces: the `/essay-notes` route, no exports consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

Create `src/app/essay-notes/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EssayNotesPage from './page';

function mockFetch(handlers: Record<string, () => any>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const key = init?.method === 'POST' ? `POST ${url}` : url;
      if (key in handlers) return handlers[key]();
      throw new Error(`unhandled fetch: ${key}`);
    })
  );
}

const baseNotes = [
  {
    id: 'a1',
    questionPrompt: '鲁迅文学的特点是什么？',
    bookName: '문학개론',
    koreanDraft: '',
    chineseAnswer: '鲁迅用现实主义手法...',
    conceptScore: 3,
    conceptChecklist: [
      { concept: '사실주의 기법', covered: true },
      { concept: '광인일기의 상징', covered: false },
      { concept: '봉건 사회 비판', covered: true },
      { concept: '백화문 사용', covered: true },
    ],
    grammarCorrections: [],
    createdAt: '2026-08-01T00:00:00Z',
  },
];

describe('Essay notes page', () => {
  beforeEach(() => {
    mockFetch({
      '/api/essay-notes': () => ({
        ok: true,
        json: async () => ({ notes: baseNotes, books: [{ id: 'b1', name: '문학개론' }] }),
      }),
      'POST /api/essay-notes/new': () => ({
        ok: true,
        json: async () => ({ id: 'q-new', prompt: '这篇课文的主题是什么？', sourcePage: 12 }),
      }),
      'POST /api/attempts/essay': () => ({
        ok: true,
        json: async () => ({
          conceptScore: 4,
          conceptChecklist: [
            { concept: 'A', covered: true },
            { concept: 'B', covered: true },
            { concept: 'C', covered: true },
            { concept: 'D', covered: true },
          ],
          grammarCorrections: [],
        }),
      }),
    });
  });

  it('renders past essay attempts with their concept checklist and score', async () => {
    render(<EssayNotesPage />);

    expect(await screen.findByText(/鲁迅文学的特点是什么/)).toBeInTheDocument();
    expect(screen.getByText('3/4점')).toBeInTheDocument();
    expect(screen.getByText(/사실주의 기법/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no past attempts', async () => {
    mockFetch({
      '/api/essay-notes': () => ({
        ok: true,
        json: async () => ({ notes: [], books: [{ id: 'b1', name: '문학개론' }] }),
      }),
    });

    render(<EssayNotesPage />);

    expect(await screen.findByText('아직 제출한 서술형 답안이 없어요.')).toBeInTheDocument();
  });

  it('lets the user pick a book, generates a new question, and submits it for grading', async () => {
    render(<EssayNotesPage />);
    await screen.findByText(/鲁迅文学的特点是什么/);

    const user = userEvent.setup();
    await user.click(screen.getByText('새 문제 풀기'));
    await user.click(await screen.findByRole('button', { name: '문학개론' }));

    expect(await screen.findByText(/这篇课文的主题是什么/)).toBeInTheDocument();

    const koreanBox = screen.getByLabelText(/1단계/);
    const chineseBox = screen.getByLabelText(/2단계/);
    await user.type(koreanBox, '내용 요약');
    await user.type(chineseBox, '答案内容');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText('4/4점')).toBeInTheDocument());
  });

  it('shows an error message when the essay notes request fails', async () => {
    mockFetch({
      '/api/essay-notes': () => ({ ok: false, status: 500 }),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<EssayNotesPage />);

    expect(await screen.findByText(/불러오지 못했어요/)).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- essay-notes/page`
Expected: FAIL with "Cannot find module './page'".

- [ ] **Step 3: Create the page styles**

Create `src/app/essay-notes/essay-notes.module.css`:

```css
.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

.subtitle {
  font-size: 16px;
  font-weight: 700;
  margin: 24px 0 12px;
}

.newButton {
  background: var(--essay-notes-accent);
  color: #ffffff;
  border: none;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  margin-bottom: 16px;
}

.bookPicker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.bookOption {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  color: var(--foreground);
}

.loading {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0;
}

.empty {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  margin-top: 20px;
}

.noteCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}

.noteBook {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.notePrompt {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.noteScore {
  font-size: 12px;
  font-weight: 700;
  color: var(--essay-notes-accent-text);
  background: var(--essay-notes-accent-bg);
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  margin-bottom: 8px;
}

.conceptChecklist {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.conceptCovered {
  font-size: 11px;
  color: var(--accent);
}

.conceptMissing {
  font-size: 11px;
  color: var(--text-secondary);
}
```

- [ ] **Step 4: Implement the page**

Create `src/app/essay-notes/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import EssayQuestion from '../components/EssayQuestion';
import type { EssayFeedback } from '../components/types';
import styles from './essay-notes.module.css';

interface ConceptCheck {
  concept: string;
  covered: boolean;
}

interface EssayNote {
  id: string;
  questionPrompt: string;
  bookName: string;
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
}

interface Book {
  id: string;
  name: string;
}

interface PracticeQuestion {
  id: string;
  prompt: string;
  sourcePage: number;
}

export default function EssayNotesPage() {
  const [notes, setNotes] = useState<EssayNote[] | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickingBook, setPickingBook] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null);
  const [koreanDraft, setKoreanDraft] = useState('');
  const [chineseAnswer, setChineseAnswer] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState<EssayFeedback | undefined>(undefined);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/essay-notes');
        if (!res.ok) throw new Error(`essay notes request failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setNotes(json.notes);
          setBooks(json.books);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('서술형 노트를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startPractice(bookId: string) {
    setGenerating(true);
    try {
      const res = await fetch('/api/essay-notes/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      const question = await res.json();
      setPracticeQuestion(question);
      setPickingBook(false);
      setKoreanDraft('');
      setChineseAnswer('');
      setPracticeFeedback(undefined);
    } finally {
      setGenerating(false);
    }
  }

  async function submitPractice() {
    if (!practiceQuestion) return;
    setGrading(true);
    try {
      const res = await fetch('/api/attempts/essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: practiceQuestion.id,
          koreanDraft,
          chineseAnswer,
        }),
      });
      const result = await res.json();
      setPracticeFeedback(result);
      const notesRes = await fetch('/api/essay-notes');
      const notesJson = await notesRes.json();
      setNotes(notesJson.notes);
    } finally {
      setGrading(false);
    }
  }

  if (error) return <p className={styles.page}>{error}</p>;
  if (!notes) return <p className={styles.page}>불러오는 중...</p>;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>서술형 노트</h1>

      {!practiceQuestion && !pickingBook && (
        <button className={styles.newButton} onClick={() => setPickingBook(true)}>
          새 문제 풀기
        </button>
      )}

      {pickingBook && !practiceQuestion && (
        <div className={styles.bookPicker}>
          {books.map((b) => (
            <button
              key={b.id}
              className={styles.bookOption}
              disabled={generating}
              onClick={() => startPractice(b.id)}
            >
              {b.name}
            </button>
          ))}
          {generating && <p className={styles.loading}>문제 만드는 중...</p>}
        </div>
      )}

      {practiceQuestion && (
        <EssayQuestion
          question={{
            id: practiceQuestion.id,
            book_id: '',
            type: 'essay',
            prompt: practiceQuestion.prompt,
            choices: null,
            source_page: practiceQuestion.sourcePage,
          }}
          koreanDraft={koreanDraft}
          chineseAnswer={chineseAnswer}
          feedback={practiceFeedback}
          onKoreanChange={setKoreanDraft}
          onChineseChange={setChineseAnswer}
          onSubmit={submitPractice}
        />
      )}
      {grading && <p className={styles.loading}>채점 중...</p>}

      <h2 className={styles.subtitle}>지난 답안</h2>
      {notes.length === 0 && <p className={styles.empty}>아직 제출한 서술형 답안이 없어요.</p>}
      {notes.map((note) => (
        <div key={note.id} className={styles.noteCard}>
          <p className={styles.noteBook}>{note.bookName}</p>
          <p className={`${styles.notePrompt} zh`}>{note.questionPrompt}</p>
          <p className={styles.noteScore}>{note.conceptScore}/4점</p>
          <ul className={styles.conceptChecklist}>
            {note.conceptChecklist.map((c, i) => (
              <li key={i} className={c.covered ? styles.conceptCovered : styles.conceptMissing}>
                {c.covered ? '✓' : '✗'} {c.concept}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- essay-notes/page`
Expected: PASS (4/4).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every suite touched by earlier tasks.

- [ ] **Step 7: Commit**

```bash
git add src/app/essay-notes/page.tsx src/app/essay-notes/essay-notes.module.css src/app/essay-notes/page.test.tsx
git commit -m "feat: add /essay-notes page for reviewing and practicing essay questions"
```

---

## Manual verification (after all tasks land)

Not a subagent task — do this in the orchestrating session once every task above is merged:

1. Run the `0002_essay_concept_grading.sql` migration in the Supabase SQL Editor (see Global
   Constraints — this repo's tooling never applies it automatically).
2. `npm run dev`, log in, complete today's session including the daily essay question — confirm
   the feedback shows a 4-item concept checklist and `N/4점`, and any flagged sentences show a
   corrected version with explanation.
3. Click the purple "서술형 노트" tab on the cover screen — confirm it navigates to `/essay-notes`.
4. Click "새 문제 풀기", pick a book, confirm a new Chinese-language essay question appears and can
   be answered and submitted, and the graded result appears using the same checklist UI.
5. Confirm the just-submitted attempt now appears at the top of "지난 답안" below.
6. Reload `/essay-notes` — confirm the new attempt persisted (re-fetched from the server).
