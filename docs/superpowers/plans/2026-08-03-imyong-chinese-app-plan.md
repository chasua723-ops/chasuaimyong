# 임용고시 중국어 15분 학습 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중등 임용고시 중국어 전공을 준비하는 1인 사용자가 매일 15분씩 전공교재 3권을
회독하며, AI가 교재 근거로 생성한 문제/암기카드/서술형 연습으로 이해도를 점검하는
반응형 웹앱을 구축한다.

**Architecture:** Next.js(App Router) 단일 코드베이스가 프론트엔드와 API 라우트를
모두 담당한다. Supabase(Postgres)가 교재 텍스트·문제·학습 기록을 저장하고, Anthropic
Claude API가 교재 페이지 텍스트를 근거(RAG)로 문제 생성·오답 설명·서술형 채점·어휘
큐레이션을 수행한다. GitHub 저장소를 Vercel에 연결해 배포한다.

**Tech Stack:** Next.js 14+ (TypeScript, App Router), Supabase (`@supabase/supabase-js`),
Anthropic SDK (`@anthropic-ai/sdk`), `pdf-parse`(런타임 추출) / `pdf-lib`(테스트 픽스처),
Vitest + Testing Library, Vercel 배포.

## Global Constraints

- 모든 AI 생성 문제/설명/채점은 반드시 해당 범위의 `book_pages` 텍스트를 근거(RAG)로
  해야 한다. 예외는 "오늘의 어휘"뿐이며, 이 경우 출처를 "AI 큐레이션"으로 명시한다.
- 오답 설명에는 반드시 출처 페이지 번호를 포함한다.
- 서술형 답안은 한국어 초안(1단계)과 중국어 답안(2단계)을 별도로 저장하고, 내용
  정확도(`contentScore`)와 중국어 표현(`chineseScore`)을 별도로 평가한다.
- v1 대상 회독 교재는 전공중국어 문법/문학개론/어학개론 3권뿐이다. 기출문제 6종은
  별도 학습 트랙이 아니라 AI 문제 생성 시 출제 스타일 참고 자료(`reference_materials`)로만
  사용한다. 교육학 상/하, 습관용어는 v1 범위 밖이다.
- 공개 배포 URL은 PIN 1개로 보호한다 (`APP_PIN` 환경변수).
- 스택은 Next.js + Supabase + Anthropic Claude API, GitHub → Vercel 배포로 고정한다.

---

## File Structure

```
imyong-app/
  package.json
  vitest.config.ts
  .env.local.example
  src/
    middleware.ts
    app/
      login/page.tsx
      page.tsx
      api/
        auth/route.ts
        session/today/route.ts
        attempts/route.ts
        attempts/essay/route.ts
        progress/route.ts
    lib/
      auth/pin.ts, pin.test.ts
      pacing.ts, pacing.test.ts
      adaptive.ts, adaptive.test.ts
      pdf/extractPages.ts, extractPages.test.ts
      ai/client.ts, client.test.ts
      ai/generateQuestions.ts, generateQuestions.test.ts
      ai/gradeEssay.ts, gradeEssay.test.ts
      ai/curateVocab.ts, curateVocab.test.ts
      ai/explainAnswer.ts, explainAnswer.test.ts
      session/assembleDailySession.ts, assembleDailySession.test.ts
      attempts/recordAttempt.ts, recordAttempt.test.ts
      attempts/recordEssayAttempt.ts, recordEssayAttempt.test.ts
      progress/getProgress.ts, getProgress.test.ts
      supabase/client.ts, supabase/server.ts
    types/db.ts
  scripts/
    ingest-book.ts, ingest-book.test.ts
    ingest-book-cli.ts
    ingest-reference.ts, ingest-reference.test.ts
    ingest-reference-cli.ts
  supabase/
    migrations/0001_init.sql
  tests/
    helpers/mockSupabase.ts
```

---

### Task 1: 프로젝트 스캐폴딩 & 테스트 인프라

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.local.example`
- Create: `src/lib/smoke.ts`, `src/lib/smoke.test.ts` (스캐폴딩 검증용, 이후 삭제하지 않고 유지해도 무방)

**Interfaces:**
- Produces: Vitest 실행 환경(`npm test`), 이후 모든 태스크가 이 위에서 테스트를 작성함

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
cd "C:\Users\user\Documents\projects\imyong-app"
npx create-next-app@latest . --typescript --eslint --app --src-dir --import-alias "@/*" --no-tailwind --use-npm
```

- [ ] **Step 2: 런타임 의존성 설치**

```bash
npm install @supabase/supabase-js @anthropic-ai/sdk pdf-parse dotenv
```

- [ ] **Step 3: 개발 의존성 설치**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom pdf-lib tsx @types/pdf-parse
```

- [ ] **Step 4: Vitest 설정 파일 작성**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 5: package.json에 테스트 스크립트 추가**

`package.json`의 `"scripts"`에 아래 항목 추가:

```json
"test": "vitest run",
"test:watch": "vitest",
"ingest:book": "tsx scripts/ingest-book-cli.ts",
"ingest:reference": "tsx scripts/ingest-reference-cli.ts"
```

- [ ] **Step 6: 환경변수 예시 파일 작성**

```bash
# .env.local.example
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
APP_PIN=
```

- [ ] **Step 7: 스모크 테스트 작성 (Vitest 동작 확인)**

```ts
// src/lib/smoke.ts
export function add(a: number, b: number): number {
  return a + b;
}
```

```ts
// src/lib/smoke.test.ts
import { describe, it, expect } from 'vitest';
import { add } from './smoke';

describe('smoke', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

- [ ] **Step 8: 테스트 실행 확인**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Vitest test infra"
```

---

### Task 2: Supabase 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: `books`, `book_pages`, `reference_materials`, `study_progress`,
  `daily_sessions`, `questions`(with `question_type` enum: `'grammar'|'vocab'|'reading'|
  'theory'|'essay'`), `attempts`, `category_stats`, `vocab_of_the_day` 테이블. 이후
  모든 태스크가 이 스키마의 컬럼명을 그대로 사용함.

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/0001_init.sql
create extension if not exists pgcrypto;

create table books (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_pages integer not null,
  exam_date date not null,
  target_read_count integer not null default 3,
  current_read_count integer not null default 1,
  current_page integer not null default 1,
  created_at timestamptz not null default now()
);

create table book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  page_num integer not null,
  content text not null,
  unique (book_id, page_num)
);

create table reference_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  page_num integer not null,
  content text not null,
  unique (name, page_num)
);

create table study_progress (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  date date not null,
  read_count integer not null,
  start_page integer not null,
  end_page integer not null,
  completed boolean not null default false,
  unique (book_id, date)
);

create table daily_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  essay_book_id uuid references books(id),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create type question_type as enum ('grammar', 'vocab', 'reading', 'theory', 'essay');

create table questions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  session_id uuid not null references daily_sessions(id) on delete cascade,
  type question_type not null,
  source_page integer not null,
  prompt text not null,
  choices jsonb,
  correct_answer text not null,
  used_reference boolean not null default false,
  created_at timestamptz not null default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_answer text,
  is_correct boolean,
  explanation text,
  korean_draft text,
  chinese_answer text,
  content_score integer,
  chinese_score integer,
  ai_feedback text,
  created_at timestamptz not null default now()
);

create table category_stats (
  id uuid primary key default gen_random_uuid(),
  type question_type not null unique,
  correct_count integer not null default 0,
  total_count integer not null default 0
);

create table vocab_of_the_day (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  word_zh text not null,
  pinyin text not null,
  meaning_ko text not null,
  example_zh text not null,
  example_ko text not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Supabase 프로젝트에 마이그레이션 적용**

Supabase 대시보드의 SQL Editor에 위 파일 내용을 붙여넣고 실행한다. (Supabase CLI를
쓸 경우: `supabase db push`)

- [ ] **Step 3: 테이블 생성 확인**

Supabase 대시보드 Table Editor에서 8개 테이블이 모두 보이는지 확인한다.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: add initial Supabase schema migration"
```

---

### Task 3: 공유 TypeScript 타입 정의

**Files:**
- Create: `src/types/db.ts`

**Interfaces:**
- Consumes: Task 2의 스키마 컬럼명
- Produces: `Book`, `BookPage`, `ReferenceMaterial`, `DailySession`, `QuestionType`,
  `QuestionRow`, `AttemptRow`, `CategoryStatRow`, `VocabOfTheDay` 타입. 이후 모든
  태스크가 이 타입을 import해서 사용함.

- [ ] **Step 1: 타입 파일 작성**

```ts
// src/types/db.ts
export type QuestionType = 'grammar' | 'vocab' | 'reading' | 'theory' | 'essay';

export interface Book {
  id: string;
  name: string;
  total_pages: number;
  exam_date: string;
  target_read_count: number;
  current_read_count: number;
  current_page: number;
}

export interface BookPage {
  id: string;
  book_id: string;
  page_num: number;
  content: string;
}

export interface ReferenceMaterial {
  id: string;
  name: string;
  page_num: number;
  content: string;
}

export interface DailySession {
  id: string;
  date: string;
  essay_book_id: string | null;
  completed: boolean;
}

export interface QuestionRow {
  id: string;
  book_id: string;
  session_id: string;
  type: QuestionType;
  source_page: number;
  prompt: string;
  choices: string[] | null;
  correct_answer: string;
  used_reference: boolean;
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
}

export interface CategoryStatRow {
  id: string;
  type: QuestionType;
  correct_count: number;
  total_count: number;
}

export interface VocabOfTheDay {
  id: string;
  date: string;
  word_zh: string;
  pinyin: string;
  meaning_ko: string;
  example_zh: string;
  example_ko: string;
}
```

- [ ] **Step 2: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/types/db.ts
git commit -m "feat: add shared DB row types"
```

---

### Task 4: PIN 인증

**Files:**
- Create: `src/lib/auth/pin.ts`, `src/lib/auth/pin.test.ts`
- Create: `src/app/api/auth/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Produces: `verifyPin(inputPin: string, expectedPin: string): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/auth/pin.test.ts
import { describe, it, expect } from 'vitest';
import { verifyPin } from './pin';

describe('verifyPin', () => {
  it('returns true when PIN matches exactly', () => {
    expect(verifyPin('1234', '1234')).toBe(true);
  });

  it('returns false when PIN does not match', () => {
    expect(verifyPin('0000', '1234')).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(verifyPin(' 1234 ', '1234')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/auth/pin.test.ts`
Expected: FAIL (`pin.ts` module not found)

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/auth/pin.ts
export function verifyPin(inputPin: string, expectedPin: string): boolean {
  return inputPin.trim() === expectedPin.trim();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/auth/pin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 인증 API 라우트 작성**

```ts
// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyPin } from '@/lib/auth/pin';

export async function POST(req: NextRequest) {
  const { pin } = (await req.json()) as { pin?: string };
  const expected = process.env.APP_PIN;

  if (!expected) {
    return NextResponse.json({ error: 'PIN not configured' }, { status: 500 });
  }
  if (!pin || !verifyPin(pin, expected)) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('imyong_auth', 'ok', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
```

- [ ] **Step 6: 미들웨어 작성 (미인증 시 /login으로 리다이렉트)**

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const isAuthed = req.cookies.get('imyong_auth')?.value === 'ok';
  const isPublic =
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/api/auth');

  if (!isAuthed && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 7: 로그인 페이지 작성**

```tsx
// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push('/');
    } else {
      setError('PIN이 올바르지 않습니다');
    }
  }

  return (
    <main style={{ maxWidth: 320, margin: '80px auto', textAlign: 'center' }}>
      <h1>임용고시 중국어</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN 입력"
          style={{ fontSize: 18, padding: 8, width: '100%' }}
        />
        <button type="submit" style={{ marginTop: 12, width: '100%', padding: 8 }}>
          입장
        </button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 8: 개발 서버로 수동 확인**

Run: `npm run dev`, 브라우저에서 `http://localhost:3000` 접속 시 `/login`으로
리다이렉트되는지, `.env.local`에 `APP_PIN=1234` 설정 후 올바른/틀린 PIN 입력 시
각각 예상대로 동작하는지 확인한다.

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth src/app/api/auth src/app/login src/middleware.ts
git commit -m "feat: add PIN authentication and login page"
```

---

### Task 5: 회독 진도 계산 (pacing)

**Files:**
- Create: `src/lib/pacing.ts`, `src/lib/pacing.test.ts`

**Interfaces:**
- Consumes: `Book` 타입(Task 3)의 `total_pages`, `exam_date`, `target_read_count`,
  `current_read_count`, `current_page`
- Produces: `calculateDailyRange(input: PacingInput): PacingResult`,
  `PacingInput`, `PacingResult` 타입

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/pacing.test.ts
import { describe, it, expect } from 'vitest';
import { calculateDailyRange } from './pacing';

describe('calculateDailyRange', () => {
  it('spreads remaining pages evenly across remaining days for a single read-through', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-13',
      today: '2026-08-03',
      targetReadCount: 1,
      currentReadCount: 1,
      currentPage: 1,
    });

    // 10 days remaining, 100 pages remaining -> 10 pages/day
    expect(result.daysRemaining).toBe(10);
    expect(result.pagesPerDay).toBe(10);
    expect(result.startPage).toBe(1);
    expect(result.endPage).toBe(10);
  });

  it('accounts for multiple remaining read-throughs', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-05',
      today: '2026-08-03',
      targetReadCount: 3,
      currentReadCount: 1,
      currentPage: 1,
    });

    // 2 days remaining, 300 pages remaining (3 full reads) -> 150 pages/day, capped at totalPages
    expect(result.daysRemaining).toBe(2);
    expect(result.pagesPerDay).toBe(150);
    expect(result.startPage).toBe(1);
    expect(result.endPage).toBe(100);
  });

  it('resumes from the current page, not page 1', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-13',
      today: '2026-08-03',
      targetReadCount: 1,
      currentReadCount: 1,
      currentPage: 51,
    });

    expect(result.startPage).toBe(51);
    // 10 days remaining, 50 pages remaining -> 5 pages/day
    expect(result.endPage).toBe(55);
  });

  it('never returns fewer than 1 day remaining even if exam date has passed', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-01',
      today: '2026-08-03',
      targetReadCount: 1,
      currentReadCount: 1,
      currentPage: 90,
    });

    expect(result.daysRemaining).toBe(1);
    expect(result.pagesPerDay).toBe(11);
    expect(result.endPage).toBe(100);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/pacing.test.ts`
Expected: FAIL (`pacing.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/pacing.ts
export interface PacingInput {
  totalPages: number;
  examDate: string; // ISO date, e.g. '2026-12-01'
  today: string; // ISO date
  targetReadCount: number;
  currentReadCount: number;
  currentPage: number; // 1-indexed, next unread page
}

export interface PacingResult {
  startPage: number;
  endPage: number;
  daysRemaining: number;
  pagesPerDay: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function calculateDailyRange(input: PacingInput): PacingResult {
  const { totalPages, examDate, today, targetReadCount, currentReadCount, currentPage } = input;

  const examMs = new Date(examDate).getTime();
  const todayMs = new Date(today).getTime();
  const daysRemaining = Math.max(1, Math.ceil((examMs - todayMs) / MS_PER_DAY));

  const readsRemaining = Math.max(1, targetReadCount - currentReadCount + 1);
  const pagesLeftInCurrentRead = Math.max(0, totalPages - (currentPage - 1));
  const fullExtraReads = Math.max(0, readsRemaining - 1) * totalPages;
  const totalPagesRemaining = pagesLeftInCurrentRead + fullExtraReads;

  const pagesPerDay = Math.max(1, Math.ceil(totalPagesRemaining / daysRemaining));

  const startPage = currentPage;
  const endPage = Math.min(totalPages, startPage + pagesPerDay - 1);

  return { startPage, endPage, daysRemaining, pagesPerDay };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/pacing.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pacing.ts src/lib/pacing.test.ts
git commit -m "feat: add reading pace calculation"
```

---

### Task 6: 적응형 유형 배분 (adaptive weighting)

**Files:**
- Create: `src/lib/adaptive.ts`, `src/lib/adaptive.test.ts`

**Interfaces:**
- Consumes: `QuestionType`(Task 3)
- Produces: `CategoryStat` 타입, `calculateWeights(stats: CategoryStat[]):
  Record<QuestionType, number>`, `pickWeightedTypes(weights, count, rng?):
  QuestionType[]`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/adaptive.test.ts
import { describe, it, expect } from 'vitest';
import { calculateWeights, pickWeightedTypes, type CategoryStat } from './adaptive';

describe('calculateWeights', () => {
  it('gives higher weight to categories with lower accuracy', () => {
    const stats: CategoryStat[] = [
      { type: 'reading', correctCount: 1, totalCount: 10 }, // 10% accuracy
      { type: 'grammar', correctCount: 9, totalCount: 10 }, // 90% accuracy
    ];

    const weights = calculateWeights(stats);

    expect(weights.reading).toBeGreaterThan(weights.grammar);
  });

  it('treats categories with no attempts as medium priority (0.5 accuracy)', () => {
    const stats: CategoryStat[] = [{ type: 'vocab', correctCount: 0, totalCount: 0 }];
    const weights = calculateWeights(stats);
    expect(weights.vocab).toBeCloseTo(0.5, 5);
  });

  it('never assigns a weight below the 0.1 floor', () => {
    const stats: CategoryStat[] = [{ type: 'theory', correctCount: 10, totalCount: 10 }];
    const weights = calculateWeights(stats);
    expect(weights.theory).toBeGreaterThanOrEqual(0.1);
  });
});

describe('pickWeightedTypes', () => {
  it('always picks the only type with nonzero weight', () => {
    const picks = pickWeightedTypes(
      { grammar: 1, vocab: 0, reading: 0, theory: 0, essay: 0 },
      3,
      () => 0.5
    );
    expect(picks).toEqual(['grammar', 'grammar', 'grammar']);
  });

  it('returns exactly `count` picks', () => {
    const picks = pickWeightedTypes(
      { grammar: 0.5, vocab: 0.5, reading: 0.5, theory: 0.5, essay: 0.5 },
      5,
      () => 0.99
    );
    expect(picks).toHaveLength(5);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/adaptive.test.ts`
Expected: FAIL (`adaptive.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/adaptive.ts
import type { QuestionType } from '@/types/db';

export interface CategoryStat {
  type: QuestionType;
  correctCount: number;
  totalCount: number;
}

export function calculateWeights(stats: CategoryStat[]): Record<QuestionType, number> {
  const weights = {} as Record<QuestionType, number>;
  for (const stat of stats) {
    const accuracy = stat.totalCount === 0 ? 0.5 : stat.correctCount / stat.totalCount;
    weights[stat.type] = Math.max(0.1, 1 - accuracy);
  }
  return weights;
}

export function pickWeightedTypes(
  weights: Record<QuestionType, number>,
  count: number,
  rng: () => number = Math.random
): QuestionType[] {
  const entries = Object.entries(weights) as [QuestionType, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  const picks: QuestionType[] = [];

  for (let i = 0; i < count; i++) {
    let r = rng() * totalWeight;
    let chosen: QuestionType = entries[entries.length - 1][0];
    for (const [type, w] of entries) {
      if (r <= w) {
        chosen = type;
        break;
      }
      r -= w;
    }
    picks.push(chosen);
  }
  return picks;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/adaptive.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/adaptive.ts src/lib/adaptive.test.ts
git commit -m "feat: add accuracy-based adaptive question type weighting"
```

---

### Task 7: PDF 페이지별 텍스트 추출

**Files:**
- Create: `src/lib/pdf/extractPages.ts`, `src/lib/pdf/extractPages.test.ts`

**Interfaces:**
- Produces: `ExtractedPage { pageNum: number; content: string }`,
  `extractPagesFromBuffer(buffer: Buffer): Promise<ExtractedPage[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/pdf/extractPages.test.ts
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPagesFromBuffer } from './extractPages';

async function buildSamplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const page1 = doc.addPage([300, 300]);
  page1.drawText('Page one content', { x: 20, y: 250, size: 14, font });

  const page2 = doc.addPage([300, 300]);
  page2.drawText('Page two content', { x: 20, y: 250, size: 14, font });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe('extractPagesFromBuffer', () => {
  it('extracts text per page with 1-indexed page numbers', async () => {
    const buffer = await buildSamplePdf();
    const pages = await extractPagesFromBuffer(buffer);

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNum).toBe(1);
    expect(pages[0].content).toContain('Page one content');
    expect(pages[1].pageNum).toBe(2);
    expect(pages[1].content).toContain('Page two content');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/pdf/extractPages.test.ts`
Expected: FAIL (`extractPages.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/pdf/extractPages.ts
import pdfParse from 'pdf-parse';

export interface ExtractedPage {
  pageNum: number;
  content: string;
}

export async function extractPagesFromBuffer(buffer: Buffer): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = [];
  let currentPage = 0;

  await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      currentPage += 1;
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      pages.push({ pageNum: currentPage, content: text });
      return text;
    },
  });

  return pages;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/pdf/extractPages.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf
git commit -m "feat: add per-page PDF text extraction"
```

---

### Task 8: 교재/기출문제 인제스트 스크립트

**Files:**
- Create: `scripts/ingest-book.ts`, `scripts/ingest-book.test.ts`, `scripts/ingest-book-cli.ts`
- Create: `scripts/ingest-reference.ts`, `scripts/ingest-reference.test.ts`, `scripts/ingest-reference-cli.ts`

**Interfaces:**
- Consumes: `extractPagesFromBuffer`(Task 7)
- Produces: `ingestBook(args, supabase): Promise<Book>`,
  `ingestReference(args, supabase): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성 (책 인제스트)**

```ts
// scripts/ingest-book.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ingestBook } from './ingest-book';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('fake-pdf-bytes')),
}));

vi.mock('../src/lib/pdf/extractPages', () => ({
  extractPagesFromBuffer: vi.fn(async () => [
    { pageNum: 1, content: 'first page' },
    { pageNum: 2, content: 'second page' },
  ]),
}));

function buildMockSupabase(insertedBook: any) {
  const single = vi.fn().mockResolvedValue({ data: insertedBook, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const booksInsert = vi.fn().mockReturnValue({ select });
  const pagesInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === 'books') return { insert: booksInsert };
    if (table === 'book_pages') return { insert: pagesInsert };
    throw new Error(`unexpected table ${table}`);
  });

  return { from, booksInsert, pagesInsert } as any;
}

describe('ingestBook', () => {
  it('inserts a book row then page rows linked by the new book id', async () => {
    const insertedBook = { id: 'book-1', name: '문법', total_pages: 2 };
    const supabase = buildMockSupabase(insertedBook);

    const result = await ingestBook(
      { filePath: 'fake.pdf', bookName: '문법', examDate: '2027-01-01', targetReadCount: 3 },
      supabase
    );

    expect(result).toEqual(insertedBook);
    expect(supabase.pagesInsert).toHaveBeenCalledWith([
      { book_id: 'book-1', page_num: 1, content: 'first page' },
      { book_id: 'book-1', page_num: 2, content: 'second page' },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run scripts/ingest-book.test.ts`
Expected: FAIL (`ingest-book.ts` module not found)

- [ ] **Step 3: 책 인제스트 구현**

```ts
// scripts/ingest-book.ts
import { readFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractPagesFromBuffer } from '../src/lib/pdf/extractPages';

export interface IngestBookArgs {
  filePath: string;
  bookName: string;
  examDate: string;
  targetReadCount: number;
}

export async function ingestBook(args: IngestBookArgs, supabase: SupabaseClient) {
  const buffer = await readFile(args.filePath);
  const pages = await extractPagesFromBuffer(buffer);

  const { data: book, error: bookError } = await supabase
    .from('books')
    .insert({
      name: args.bookName,
      total_pages: pages.length,
      exam_date: args.examDate,
      target_read_count: args.targetReadCount,
      current_read_count: 1,
      current_page: 1,
    })
    .select()
    .single();

  if (bookError) throw bookError;

  const rows = pages.map((p) => ({ book_id: book.id, page_num: p.pageNum, content: p.content }));
  const { error: pagesError } = await supabase.from('book_pages').insert(rows);
  if (pagesError) throw pagesError;

  return book;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run scripts/ingest-book.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: 책 인제스트 CLI 작성**

```ts
// scripts/ingest-book-cli.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ingestBook } from './ingest-book';

const [, , filePath, bookName, examDate, targetReadCountStr] = process.argv;

if (!filePath || !bookName || !examDate || !targetReadCountStr) {
  console.error(
    'Usage: npm run ingest:book -- <filePath> <bookName> <examDate:YYYY-MM-DD> <targetReadCount>'
  );
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

ingestBook(
  { filePath, bookName, examDate, targetReadCount: Number(targetReadCountStr) },
  supabase
)
  .then((book) => console.log(`Ingested ${book.name}: ${book.total_pages} pages`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 6: 실패하는 테스트 작성 (기출문제 인제스트)**

```ts
// scripts/ingest-reference.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ingestReference } from './ingest-reference';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('fake-pdf-bytes')),
}));

vi.mock('../src/lib/pdf/extractPages', () => ({
  extractPagesFromBuffer: vi.fn(async () => [{ pageNum: 1, content: '기출 문제 1' }]),
}));

describe('ingestReference', () => {
  it('inserts one row per page tagged with the material name', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) } as any;

    await ingestReference({ filePath: 'fake.pdf', materialName: '독해기출 특강' }, supabase);

    expect(supabase.from).toHaveBeenCalledWith('reference_materials');
    expect(insert).toHaveBeenCalledWith([
      { name: '독해기출 특강', page_num: 1, content: '기출 문제 1' },
    ]);
  });
});
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `npx vitest run scripts/ingest-reference.test.ts`
Expected: FAIL (`ingest-reference.ts` module not found)

- [ ] **Step 8: 기출문제 인제스트 구현**

```ts
// scripts/ingest-reference.ts
import { readFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractPagesFromBuffer } from '../src/lib/pdf/extractPages';

export interface IngestReferenceArgs {
  filePath: string;
  materialName: string;
}

export async function ingestReference(args: IngestReferenceArgs, supabase: SupabaseClient) {
  const buffer = await readFile(args.filePath);
  const pages = await extractPagesFromBuffer(buffer);

  const rows = pages.map((p) => ({
    name: args.materialName,
    page_num: p.pageNum,
    content: p.content,
  }));

  const { error } = await supabase.from('reference_materials').insert(rows);
  if (error) throw error;
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `npx vitest run scripts/ingest-reference.test.ts`
Expected: PASS (1 test)

- [ ] **Step 10: 기출문제 인제스트 CLI 작성**

```ts
// scripts/ingest-reference-cli.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ingestReference } from './ingest-reference';

const [, , filePath, materialName] = process.argv;

if (!filePath || !materialName) {
  console.error('Usage: npm run ingest:reference -- <filePath> <materialName>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

ingestReference({ filePath, materialName }, supabase)
  .then(() => console.log(`Ingested reference material: ${materialName}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 11: Commit**

```bash
git add scripts
git commit -m "feat: add PDF ingestion scripts for books and reference materials"
```

---

### Task 9: Anthropic 클라이언트 래퍼

**Files:**
- Create: `src/lib/ai/client.ts`, `src/lib/ai/client.test.ts`

**Interfaces:**
- Produces: `getAnthropicClient(): Anthropic`,
  `askClaude(client: Anthropic, prompt: string, options?: AskClaudeOptions): Promise<string>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/ai/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { askClaude } from './client';

describe('askClaude', () => {
  it('returns the text content from the response', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello from claude' }],
        }),
      },
    } as any;

    const result = await askClaude(fakeClient, 'say hello');

    expect(result).toBe('hello from claude');
    expect(fakeClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: 'say hello' }] })
    );
  });

  it('throws when the response contains no text block', async () => {
    const fakeClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    } as any;

    await expect(askClaude(fakeClient, 'say hello')).rejects.toThrow('no text block');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/ai/client.test.ts`
Expected: FAIL (`client.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/ai/client.ts
import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

export interface AskClaudeOptions {
  system?: string;
  maxTokens?: number;
}

export async function askClaude(
  client: Anthropic,
  prompt: string,
  options: AskClaudeOptions = {}
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: options.maxTokens ?? 1024,
    system: options.system,
    messages: [{ role: 'user', content: prompt }],
  } as any);

  const textBlock = (response as any).content.find((block: any) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Claude response contained no text block');
  }
  return textBlock.text;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/ai/client.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/client.ts src/lib/ai/client.test.ts
git commit -m "feat: add Anthropic client wrapper"
```

---

### Task 10: 문제/카드 생성 서비스 (RAG)

**Files:**
- Create: `src/lib/ai/generateQuestions.ts`, `src/lib/ai/generateQuestions.test.ts`

**Interfaces:**
- Consumes: `askClaude`(Task 9), `QuestionType`(Task 3)
- Produces: `GeneratedQuestion`, `QuestionGenInput`,
  `generateQuestions(client, input): Promise<GeneratedQuestion[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/ai/generateQuestions.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateQuestions } from './generateQuestions';

function fakeClientReturning(text: string) {
  return {
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) },
  } as any;
}

describe('generateQuestions', () => {
  it('parses the JSON question array returned by Claude', async () => {
    const questions = [
      { type: 'grammar', sourcePage: 12, prompt: '다음 문장의 오류를 찾으시오', correctAnswer: 'B' },
    ];
    const client = fakeClientReturning(JSON.stringify(questions));

    const result = await generateQuestions(client, {
      bookName: '전공중국어 문법',
      pages: [{ pageNum: 12, content: '把자문 설명' }],
      types: ['grammar'],
    });

    expect(result).toEqual(questions);
  });

  it('embeds page markers and reference excerpts in the prompt sent to Claude', async () => {
    const client = fakeClientReturning('[]');

    await generateQuestions(client, {
      bookName: '전공중국어 문법',
      pages: [{ pageNum: 5, content: '내용' }],
      types: ['reading'],
      referenceExcerpts: ['기출 예시 문제'],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('[p.5]');
    expect(sentPrompt).toContain('기출 예시 문제');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/ai/generateQuestions.test.ts`
Expected: FAIL (`generateQuestions.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/ai/generateQuestions.ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';
import type { QuestionType } from '@/types/db';

export interface QuestionGenInput {
  bookName: string;
  pages: { pageNum: number; content: string }[];
  types: QuestionType[];
  referenceExcerpts?: string[];
}

export interface GeneratedQuestion {
  type: QuestionType;
  sourcePage: number;
  prompt: string;
  choices?: string[];
  correctAnswer: string;
}

export async function generateQuestions(
  client: Anthropic,
  input: QuestionGenInput
): Promise<GeneratedQuestion[]> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');
  const referenceText = input.referenceExcerpts?.length
    ? `\n\n실제 기출문제 스타일 참고:\n${input.referenceExcerpts.join('\n---\n')}`
    : '';

  const prompt =
    `다음은 "${input.bookName}" 교재의 일부 발췌입니다. 이 내용만을 근거로 ` +
    `${input.types.join(', ')} 유형의 문제를 각 1개씩 만들어주세요. ` +
    `각 문제는 반드시 아래 JSON 배열 형식으로만 응답하세요:\n` +
    `[{"type":"grammar","sourcePage":12,"prompt":"...","choices":["...","..."],"correctAnswer":"..."}]\n\n` +
    `교재 발췌:\n${pageText}${referenceText}`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 출제 위원입니다. 반드시 주어진 교재 내용에만 근거해 문제를 냅니다.',
    maxTokens: 2048,
  });

  return JSON.parse(raw) as GeneratedQuestion[];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/ai/generateQuestions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/generateQuestions.ts src/lib/ai/generateQuestions.test.ts
git commit -m "feat: add RAG-based question generation service"
```

---

### Task 11: 오답 설명 서비스

**Files:**
- Create: `src/lib/ai/explainAnswer.ts`, `src/lib/ai/explainAnswer.test.ts`

**Interfaces:**
- Consumes: `askClaude`(Task 9)
- Produces: `explainAnswer(client, input: ExplainInput): Promise<string>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/ai/explainAnswer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { explainAnswer } from './explainAnswer';

describe('explainAnswer', () => {
  it('includes the page content, correct answer, and user answer in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '설명입니다' }] }),
      },
    } as any;

    const result = await explainAnswer(client, {
      bookName: '전공중국어 문법',
      sourcePage: 12,
      pageContent: '把자문은 목적어를 동사 앞으로 이동시킨다',
      questionPrompt: '把자문의 어순은?',
      correctAnswer: '주어+把+목적어+동사',
      userAnswer: '주어+동사+목적어',
    });

    expect(result).toBe('설명입니다');
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('把자문은 목적어를 동사 앞으로 이동시킨다');
    expect(sentPrompt).toContain('주어+把+목적어+동사');
    expect(sentPrompt).toContain('주어+동사+목적어');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/ai/explainAnswer.test.ts`
Expected: FAIL (`explainAnswer.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/ai/explainAnswer.ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface ExplainInput {
  bookName: string;
  sourcePage: number;
  pageContent: string;
  questionPrompt: string;
  correctAnswer: string;
  userAnswer: string;
}

export async function explainAnswer(client: Anthropic, input: ExplainInput): Promise<string> {
  const prompt =
    `"${input.bookName}" ${input.sourcePage}페이지 내용을 근거로, 아래 문제에서 사용자가 왜 ` +
    `틀렸는지 한국어로 설명해주세요.\n\n` +
    `교재 내용: ${input.pageContent}\n` +
    `문제: ${input.questionPrompt}\n` +
    `정답: ${input.correctAnswer}\n` +
    `사용자 답: ${input.userAnswer}\n\n` +
    `설명은 3문장 이내로, 반드시 위 교재 내용에 근거해서 작성하세요.`;

  return askClaude(client, prompt, {
    system: '당신은 중등 임용고시 중국어 과목 튜터입니다.',
    maxTokens: 300,
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/ai/explainAnswer.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/explainAnswer.ts src/lib/ai/explainAnswer.test.ts
git commit -m "feat: add book-grounded wrong-answer explanation service"
```

---

### Task 12: 서술형 채점 서비스 (2단계)

**Files:**
- Create: `src/lib/ai/gradeEssay.ts`, `src/lib/ai/gradeEssay.test.ts`

**Interfaces:**
- Consumes: `askClaude`(Task 9)
- Produces: `EssayGradeResult { contentScore, chineseScore, feedback }`,
  `gradeEssay(client, input: EssayGradeInput): Promise<EssayGradeResult>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/ai/gradeEssay.test.ts
import { describe, it, expect, vi } from 'vitest';
import { gradeEssay } from './gradeEssay';

describe('gradeEssay', () => {
  it('parses contentScore/chineseScore/feedback from the JSON response', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ contentScore: 80, chineseScore: 60, feedback: '문법 오류 있음' }),
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

    expect(result).toEqual({ contentScore: 80, chineseScore: 60, feedback: '문법 오류 있음' });
  });

  it('includes both the Korean draft and Chinese answer in the prompt sent to Claude', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"contentScore":0,"chineseScore":0,"feedback":""}' }],
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

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/ai/gradeEssay.test.ts`
Expected: FAIL (`gradeEssay.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/ai/gradeEssay.ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface EssayGradeInput {
  bookName: string;
  pages: { pageNum: number; content: string }[];
  questionPrompt: string;
  koreanDraft: string;
  chineseAnswer: string;
}

export interface EssayGradeResult {
  contentScore: number;
  chineseScore: number;
  feedback: string;
}

export async function gradeEssay(client: Anthropic, input: EssayGradeInput): Promise<EssayGradeResult> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');

  const prompt =
    `아래는 "${input.bookName}" 교재 발췌와 서술형 문제, 사용자의 2단계 답안입니다.\n` +
    `문제: ${input.questionPrompt}\n\n` +
    `1단계(한국어 내용 정리): ${input.koreanDraft}\n` +
    `2단계(중국어 답안): ${input.chineseAnswer}\n\n` +
    `교재 발췌:\n${pageText}\n\n` +
    `다음 JSON 형식으로만 응답하세요: ` +
    `{"contentScore": 0-100 정수, "chineseScore": 0-100 정수, "feedback": "교재 근거를 포함한 한국어 피드백"}\n` +
    `contentScore는 교재 내용과 비교한 정확도, chineseScore는 중국어 표현의 정확성과 자연스러움을 평가하세요.`;

  const raw = await askClaude(client, prompt, {
    system: '당신은 중등 임용고시 중국어 서술형 채점관입니다. 반드시 주어진 교재 내용에 근거해 채점하세요.',
    maxTokens: 1024,
  });

  return JSON.parse(raw) as EssayGradeResult;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/ai/gradeEssay.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/gradeEssay.ts src/lib/ai/gradeEssay.test.ts
git commit -m "feat: add two-stage essay grading service"
```

---

### Task 13: 오늘의 어휘 큐레이션

**Files:**
- Create: `src/lib/ai/curateVocab.ts`, `src/lib/ai/curateVocab.test.ts`

**Interfaces:**
- Consumes: `askClaude`(Task 9)
- Produces: `VocabItem`, `curateVocab(client, excludeWords: string[]): Promise<VocabItem>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/ai/curateVocab.test.ts
import { describe, it, expect, vi } from 'vitest';
import { curateVocab } from './curateVocab';

describe('curateVocab', () => {
  it('parses a single vocab item from the JSON response', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                wordZh: '内卷',
                pinyin: 'nèijuǎn',
                meaningKo: '내권 (과도한 경쟁)',
                exampleZh: '现在竞争太内卷了。',
                exampleKo: '요즘 경쟁이 너무 내권화되었다.',
              }),
            },
          ],
        }),
      },
    } as any;

    const result = await curateVocab(client, []);

    expect(result.wordZh).toBe('内卷');
    expect(result.pinyin).toBe('nèijuǎn');
  });

  it('includes previously used words in the exclusion list sent to Claude', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '{"wordZh":"x","pinyin":"x","meaningKo":"x","exampleZh":"x","exampleKo":"x"}',
            },
          ],
        }),
      },
    } as any;

    await curateVocab(client, ['内卷', '躺平']);

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('内卷');
    expect(sentPrompt).toContain('躺平');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/ai/curateVocab.test.ts`
Expected: FAIL (`curateVocab.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/ai/curateVocab.ts
import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface VocabItem {
  wordZh: string;
  pinyin: string;
  meaningKo: string;
  exampleZh: string;
  exampleKo: string;
}

export async function curateVocab(client: Anthropic, excludeWords: string[]): Promise<VocabItem> {
  const prompt =
    `중등 임용고시 중국어 과목 독해 지문에 나올 법한, 최근 출제 경향의 트렌드 중국어 어휘를 ` +
    `1개 추천해주세요. 이미 낸 단어는 제외: ${excludeWords.join(', ') || '없음'}\n` +
    `다음 JSON 형식으로만 응답하세요: ` +
    `{"wordZh":"...","pinyin":"...","meaningKo":"...","exampleZh":"...","exampleKo":"..."}`;

  const raw = await askClaude(client, prompt, {
    system: '당신은 중국어 임용고시 출제 경향에 정통한 어휘 큐레이터입니다.',
    maxTokens: 512,
  });

  return JSON.parse(raw) as VocabItem;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/ai/curateVocab.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/curateVocab.ts src/lib/ai/curateVocab.test.ts
git commit -m "feat: add AI-curated trending vocabulary service"
```

---

### Task 14: 테스트용 Supabase 목(mock) 헬퍼

**Files:**
- Create: `tests/helpers/mockSupabase.ts`

**Interfaces:**
- Produces: `createMockSupabase(tables: Record<string, any[]>): { from, inserted }`
  이후 Task 15~18의 오케스트레이션/API 테스트에서 재사용됨

- [ ] **Step 1: 헬퍼 구현 작성**

이 헬퍼는 자체 테스트 없이 다음 태스크들의 테스트에서 직접 검증된다 (테스트 인프라
코드이므로 사용처의 테스트가 곧 이 헬퍼의 테스트다).

```ts
// tests/helpers/mockSupabase.ts
import { vi } from 'vitest';

type TableData = Record<string, any[]>;

export function createMockSupabase(tables: TableData) {
  const inserted: Record<string, any[]> = {};
  const store: TableData = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, [...v]])
  );

  function builder(table: string) {
    let rows = store[table] ?? [];

    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val);
        return api;
      },
      gte: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] >= val);
        return api;
      },
      lte: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] <= val);
        return api;
      },
      ilike: (col: string, pattern: string) => {
        const needle = pattern.replace(/%/g, '');
        rows = rows.filter((r) => String(r[col]).includes(needle));
        return api;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return api;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      insert: (payload: any) => {
        const arr = Array.isArray(payload) ? payload : [payload];
        inserted[table] = [...(inserted[table] ?? []), ...arr];
        const withId = arr.map((r, i) => ({
          id: `${table}-${(store[table]?.length ?? 0) + i}`,
          ...r,
        }));
        store[table] = [...(store[table] ?? []), ...withId];
        rows = withId;
        return api;
      },
      update: (payload: any) => ({
        eq: async (col: string, val: any) => {
          store[table] = (store[table] ?? []).map((r) =>
            r[col] === val ? { ...r, ...payload } : r
          );
          return { data: store[table].filter((r) => r[col] === val), error: null };
        },
      }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return api;
  }

  return {
    from: vi.fn((table: string) => builder(table)),
    inserted,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/mockSupabase.ts
git commit -m "test: add reusable mock Supabase query builder for unit tests"
```

---

### Task 15: 일일 세션 조립 (assembleDailySession)

**Files:**
- Create: `src/lib/session/assembleDailySession.ts`, `src/lib/session/assembleDailySession.test.ts`

**Interfaces:**
- Consumes: `calculateDailyRange`(Task 5), `calculateWeights`/`pickWeightedTypes`(Task 6),
  `generateQuestions`(Task 10), `curateVocab`(Task 13), `createMockSupabase`(Task 14)
- Produces: `assembleDailySession(supabase, aiClient, today: string): Promise<DailySession>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/session/assembleDailySession.test.ts
import { describe, it, expect, vi } from 'vitest';
import { assembleDailySession } from './assembleDailySession';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn(async (_client: any, input: any) => {
    if (input.types.includes('essay')) {
      return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
    }
    return [{ type: 'grammar', sourcePage: 3, prompt: 'q', correctAnswer: 'a' }];
  }),
}));
vi.mock('../ai/curateVocab', () => ({
  curateVocab: vi.fn().mockResolvedValue({
    wordZh: '内卷',
    pinyin: 'nèijuǎn',
    meaningKo: '내권',
    exampleZh: '例句',
    exampleKo: '예문',
  }),
}));

const baseTables = {
  daily_sessions: [],
  books: [
    {
      id: 'b1',
      name: '문법',
      total_pages: 100,
      exam_date: '2026-12-01',
      target_read_count: 3,
      current_read_count: 1,
      current_page: 1,
    },
  ],
  category_stats: [],
  book_pages: [{ book_id: 'b1', page_num: 1, content: '내용1' }],
  reference_materials: [],
  vocab_of_the_day: [],
};

describe('assembleDailySession', () => {
  it('creates a session, generates questions per book, and curates vocab when missing', async () => {
    const supabase = createMockSupabase(baseTables);

    const session = await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(session).toBeTruthy();
    expect(supabase.inserted.questions?.length).toBeGreaterThan(0);
    expect(supabase.inserted.vocab_of_the_day?.length).toBe(1);
  });

  it('does not regenerate vocab if already present for today', async () => {
    const supabase = createMockSupabase({
      ...baseTables,
      vocab_of_the_day: [{ date: '2026-08-03', word_zh: '既有' }],
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(supabase.inserted.vocab_of_the_day).toBeUndefined();
  });

  it('adds exactly one essay question, and only for the book assigned to today\'s essay slot', async () => {
    const supabase = createMockSupabase(baseTables);

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    const essayQuestions = supabase.inserted.questions.filter((q: any) => q.type === 'essay');
    expect(essayQuestions).toHaveLength(1);
    expect(essayQuestions[0].book_id).toBe('b1');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/session/assembleDailySession.test.ts`
Expected: FAIL (`assembleDailySession.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/session/assembleDailySession.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { calculateDailyRange } from '@/lib/pacing';
import { calculateWeights, pickWeightedTypes, type CategoryStat } from '@/lib/adaptive';
import { generateQuestions } from '@/lib/ai/generateQuestions';
import { curateVocab } from '@/lib/ai/curateVocab';

const QUESTIONS_PER_BOOK = 3;
const QUIZ_TYPES = ['grammar', 'vocab', 'reading', 'theory'] as const;

export async function assembleDailySession(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  today: string
) {
  const { data: existing } = await (supabase.from('daily_sessions') as any)
    .select('*')
    .eq('date', today)
    .maybeSingle();

  if (existing) return existing;

  const { data: books } = await (supabase.from('books') as any).select('*');
  if (!books || books.length === 0) throw new Error('No books found');

  const { data: statsRows } = await (supabase.from('category_stats') as any).select('*');
  const stats: CategoryStat[] = (statsRows ?? []).map((r: any) => ({
    type: r.type,
    correctCount: r.correct_count,
    totalCount: r.total_count,
  }));
  const weights = calculateWeights(stats);

  const dayIndex = Math.floor(new Date(today).getTime() / (1000 * 60 * 60 * 24));
  const essayBook = books[dayIndex % books.length];

  const { data: session } = await (supabase.from('daily_sessions') as any)
    .insert({ date: today, essay_book_id: essayBook.id, completed: false })
    .select()
    .single();

  for (const book of books) {
    const range = calculateDailyRange({
      totalPages: book.total_pages,
      examDate: book.exam_date,
      today,
      targetReadCount: book.target_read_count,
      currentReadCount: book.current_read_count,
      currentPage: book.current_page,
    });

    const { data: pages } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', book.id)
      .gte('page_num', range.startPage)
      .lte('page_num', range.endPage);

    const quizWeights = Object.fromEntries(
      QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
    ) as Record<(typeof QUIZ_TYPES)[number], number>;
    const types = pickWeightedTypes(quizWeights as any, QUESTIONS_PER_BOOK);

    let referenceExcerpts: string[] | undefined;
    if (types.includes('reading')) {
      const { data: refs } = await (supabase.from('reference_materials') as any)
        .select('content')
        .ilike('name', '%독해%')
        .limit(2);
      referenceExcerpts = (refs ?? []).map((r: any) => r.content);
    }

    const pageRange = (pages ?? []).map((p: any) => ({ pageNum: p.page_num, content: p.content }));

    const generated = await generateQuestions(aiClient, {
      bookName: book.name,
      pages: pageRange,
      types,
      referenceExcerpts,
    });

    const rows = generated.map((q) => ({
      book_id: book.id,
      session_id: session.id,
      type: q.type,
      source_page: q.sourcePage,
      prompt: q.prompt,
      choices: q.choices ?? null,
      correct_answer: q.correctAnswer,
      used_reference: !!referenceExcerpts,
    }));
    await (supabase.from('questions') as any).insert(rows);

    if (book.id === essayBook.id) {
      const essayGenerated = await generateQuestions(aiClient, {
        bookName: book.name,
        pages: pageRange,
        types: ['essay'],
      });
      const essayRows = essayGenerated.map((q) => ({
        book_id: book.id,
        session_id: session.id,
        type: 'essay' as const,
        source_page: q.sourcePage,
        prompt: q.prompt,
        choices: null,
        correct_answer: q.correctAnswer,
        used_reference: false,
      }));
      await (supabase.from('questions') as any).insert(essayRows);
    }
  }

  const { data: existingVocab } = await (supabase.from('vocab_of_the_day') as any)
    .select('*')
    .eq('date', today)
    .maybeSingle();

  if (!existingVocab) {
    const { data: pastVocab } = await (supabase.from('vocab_of_the_day') as any).select('word_zh');
    const vocab = await curateVocab(aiClient, (pastVocab ?? []).map((v: any) => v.word_zh));
    await (supabase.from('vocab_of_the_day') as any).insert({
      date: today,
      word_zh: vocab.wordZh,
      pinyin: vocab.pinyin,
      meaning_ko: vocab.meaningKo,
      example_zh: vocab.exampleZh,
      example_ko: vocab.exampleKo,
    });
  }

  return session;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/session/assembleDailySession.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/session
git commit -m "feat: assemble daily session with adaptive question generation and vocab curation"
```

---

### Task 16: 답안 제출 처리 (퀴즈/카드)

**Files:**
- Create: `src/lib/attempts/recordAttempt.ts`, `src/lib/attempts/recordAttempt.test.ts`
- Create: `src/app/api/attempts/route.ts`

**Interfaces:**
- Consumes: `explainAnswer`(Task 11), `createMockSupabase`(Task 14)
- Produces: `recordAttempt(supabase, aiClient, input): Promise<{ isCorrect, explanation, sourcePage }>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/attempts/recordAttempt.test.ts
import { describe, it, expect, vi } from 'vitest';
import { recordAttempt } from './recordAttempt';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('../ai/explainAnswer', () => ({
  explainAnswer: vi.fn().mockResolvedValue('把자문은 목적어를 동사 앞에 둡니다'),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    questions: [
      {
        id: 'q1',
        book_id: 'b1',
        source_page: 12,
        prompt: '把자문의 어순은?',
        correct_answer: '주어+把+목적어+동사',
        type: 'grammar',
      },
    ],
    book_pages: [{ book_id: 'b1', page_num: 12, content: '把자문 설명' }],
    attempts: [],
    category_stats: [],
    ...overrides,
  };
}

describe('recordAttempt', () => {
  it('marks a correct answer without generating an explanation', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await recordAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      userAnswer: '주어+把+목적어+동사',
    });

    expect(result.isCorrect).toBe(true);
    expect(result.explanation).toBeNull();
    expect(supabase.inserted.attempts[0]).toMatchObject({ is_correct: true });
  });

  it('generates a book-grounded explanation and increments category stats on a wrong answer', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await recordAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      userAnswer: '틀린 답',
    });

    expect(result.isCorrect).toBe(false);
    expect(result.explanation).toBe('把자문은 목적어를 동사 앞에 둡니다');
    expect(result.sourcePage).toBe(12);
    expect(supabase.inserted.category_stats[0]).toMatchObject({
      type: 'grammar',
      correct_count: 0,
      total_count: 1,
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/attempts/recordAttempt.test.ts`
Expected: FAIL (`recordAttempt.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/attempts/recordAttempt.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { explainAnswer } from '@/lib/ai/explainAnswer';

export interface RecordAttemptInput {
  questionId: string;
  userAnswer: string;
}

export async function recordAttempt(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: RecordAttemptInput
) {
  const { data: question } = await (supabase.from('questions') as any)
    .select('*')
    .eq('id', input.questionId)
    .single();
  if (!question) throw new Error('Question not found');

  const isCorrect = question.correct_answer.trim() === input.userAnswer.trim();
  let explanation: string | null = null;

  if (!isCorrect) {
    const { data: page } = await (supabase.from('book_pages') as any)
      .select('content')
      .eq('book_id', question.book_id)
      .eq('page_num', question.source_page)
      .single();

    explanation = await explainAnswer(aiClient, {
      bookName: '',
      sourcePage: question.source_page,
      pageContent: page?.content ?? '',
      questionPrompt: question.prompt,
      correctAnswer: question.correct_answer,
      userAnswer: input.userAnswer,
    });
  }

  await (supabase.from('attempts') as any).insert({
    question_id: question.id,
    user_answer: input.userAnswer,
    is_correct: isCorrect,
    explanation,
  });

  const { data: statRow } = await (supabase.from('category_stats') as any)
    .select('*')
    .eq('type', question.type)
    .maybeSingle();

  if (statRow) {
    await (supabase.from('category_stats') as any)
      .update({
        correct_count: statRow.correct_count + (isCorrect ? 1 : 0),
        total_count: statRow.total_count + 1,
      })
      .eq('id', statRow.id);
  } else {
    await (supabase.from('category_stats') as any).insert({
      type: question.type,
      correct_count: isCorrect ? 1 : 0,
      total_count: 1,
    });
  }

  return { isCorrect, explanation, sourcePage: question.source_page };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/attempts/recordAttempt.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: API 라우트 작성**

```ts
// src/app/api/attempts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { recordAttempt } from '@/lib/attempts/recordAttempt';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { questionId: string; userAnswer: string };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const result = await recordAttempt(supabase, getAnthropicClient(), body);
  return NextResponse.json(result);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/attempts/recordAttempt.ts src/lib/attempts/recordAttempt.test.ts src/app/api/attempts/route.ts
git commit -m "feat: record quiz attempts with book-grounded explanations and category stats"
```

---

### Task 17: 서술형 답안 제출 처리

**Files:**
- Create: `src/lib/attempts/recordEssayAttempt.ts`, `src/lib/attempts/recordEssayAttempt.test.ts`
- Create: `src/app/api/attempts/essay/route.ts`

**Interfaces:**
- Consumes: `gradeEssay`(Task 12), `createMockSupabase`(Task 14)
- Produces: `recordEssayAttempt(supabase, aiClient, input): Promise<EssayGradeResult>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/attempts/recordEssayAttempt.test.ts
import { describe, it, expect, vi } from 'vitest';
import { recordEssayAttempt } from './recordEssayAttempt';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('../ai/gradeEssay', () => ({
  gradeEssay: vi.fn().mockResolvedValue({ contentScore: 75, chineseScore: 55, feedback: '표현 개선 필요' }),
}));

describe('recordEssayAttempt', () => {
  it('saves the Korean draft and Chinese answer separately with their AI scores', async () => {
    const supabase = createMockSupabase({
      questions: [
        {
          id: 'q1',
          book_id: 'b1',
          source_page: 30,
          prompt: '루쉰 문학의 특징을 서술하시오',
        },
      ],
      book_pages: [{ book_id: 'b1', page_num: 30, content: '루쉰의 광인일기' }],
      attempts: [],
    });

    const result = await recordEssayAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      koreanDraft: '루쉰은 사실주의 기법으로...',
      chineseAnswer: '鲁迅用现实主义手法...',
    });

    expect(result).toEqual({ contentScore: 75, chineseScore: 55, feedback: '표현 개선 필요' });
    expect(supabase.inserted.attempts[0]).toMatchObject({
      question_id: 'q1',
      korean_draft: '루쉰은 사실주의 기법으로...',
      chinese_answer: '鲁迅用现实主义手法...',
      content_score: 75,
      chinese_score: 55,
      ai_feedback: '표현 개선 필요',
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/attempts/recordEssayAttempt.test.ts`
Expected: FAIL (`recordEssayAttempt.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/attempts/recordEssayAttempt.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { gradeEssay } from '@/lib/ai/gradeEssay';

export interface RecordEssayAttemptInput {
  questionId: string;
  koreanDraft: string;
  chineseAnswer: string;
}

export async function recordEssayAttempt(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: RecordEssayAttemptInput
) {
  const { data: question } = await (supabase.from('questions') as any)
    .select('*')
    .eq('id', input.questionId)
    .single();
  if (!question) throw new Error('Question not found');

  const { data: page } = await (supabase.from('book_pages') as any)
    .select('content')
    .eq('book_id', question.book_id)
    .eq('page_num', question.source_page)
    .single();

  const grade = await gradeEssay(aiClient, {
    bookName: '',
    pages: [{ pageNum: question.source_page, content: page?.content ?? '' }],
    questionPrompt: question.prompt,
    koreanDraft: input.koreanDraft,
    chineseAnswer: input.chineseAnswer,
  });

  await (supabase.from('attempts') as any).insert({
    question_id: question.id,
    korean_draft: input.koreanDraft,
    chinese_answer: input.chineseAnswer,
    content_score: grade.contentScore,
    chinese_score: grade.chineseScore,
    ai_feedback: grade.feedback,
  });

  return grade;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/attempts/recordEssayAttempt.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: API 라우트 작성**

```ts
// src/app/api/attempts/essay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { recordEssayAttempt } from '@/lib/attempts/recordEssayAttempt';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    questionId: string;
    koreanDraft: string;
    chineseAnswer: string;
  };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const result = await recordEssayAttempt(supabase, getAnthropicClient(), body);
  return NextResponse.json(result);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/attempts/recordEssayAttempt.ts src/lib/attempts/recordEssayAttempt.test.ts src/app/api/attempts/essay/route.ts
git commit -m "feat: record two-stage essay attempts with separate content/Chinese scoring"
```

---

### Task 18: 진행률 조회

**Files:**
- Create: `src/lib/progress/getProgress.ts`, `src/lib/progress/getProgress.test.ts`
- Create: `src/app/api/progress/route.ts`

**Interfaces:**
- Consumes: `createMockSupabase`(Task 14)
- Produces: `getProgress(supabase): Promise<ProgressSummary>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/progress/getProgress.test.ts
import { describe, it, expect } from 'vitest';
import { getProgress } from './getProgress';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

describe('getProgress', () => {
  it('returns per-book percent-complete and per-category accuracy', async () => {
    const supabase = createMockSupabase({
      books: [
        { id: 'b1', name: '문법', total_pages: 100, current_page: 51, current_read_count: 1, target_read_count: 3 },
      ],
      category_stats: [{ type: 'grammar', correct_count: 3, total_count: 4 }],
    });

    const result = await getProgress(supabase as any);

    expect(result.books[0]).toMatchObject({ name: '문법', percentComplete: 50, currentReadCount: 1, targetReadCount: 3 });
    expect(result.categoryAccuracy.grammar).toBeCloseTo(0.75, 5);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/progress/getProgress.test.ts`
Expected: FAIL (`getProgress.ts` module not found)

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/progress/getProgress.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestionType } from '@/types/db';

export interface ProgressSummary {
  books: {
    name: string;
    percentComplete: number;
    currentReadCount: number;
    targetReadCount: number;
  }[];
  categoryAccuracy: Partial<Record<QuestionType, number>>;
}

export async function getProgress(supabase: SupabaseClient): Promise<ProgressSummary> {
  const { data: books } = await (supabase.from('books') as any).select('*');
  const { data: stats } = await (supabase.from('category_stats') as any).select('*');

  const bookSummaries = (books ?? []).map((b: any) => ({
    name: b.name,
    percentComplete: Math.round(((b.current_page - 1) / b.total_pages) * 100),
    currentReadCount: b.current_read_count,
    targetReadCount: b.target_read_count,
  }));

  const categoryAccuracy: Partial<Record<QuestionType, number>> = {};
  for (const s of stats ?? []) {
    categoryAccuracy[s.type as QuestionType] = s.total_count === 0 ? 0 : s.correct_count / s.total_count;
  }

  return { books: bookSummaries, categoryAccuracy };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/progress/getProgress.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: API 라우트 작성**

```ts
// src/app/api/progress/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProgress } from '@/lib/progress/getProgress';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await getProgress(supabase);
  return NextResponse.json(result);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/progress src/app/api/progress
git commit -m "feat: add study progress summary endpoint"
```

---

### Task 19: 일일 세션 API 라우트 & 프론트엔드 화면

**Files:**
- Create: `src/app/api/session/today/route.ts`
- Create: `src/app/page.tsx`
- Create: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `assembleDailySession`(Task 15), 답안 제출은 `/api/attempts`,
  `/api/attempts/essay`(Task 16, 17)

- [ ] **Step 1: 세션 API 라우트 작성**

```ts
// src/app/api/session/today/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { assembleDailySession } from '@/lib/session/assembleDailySession';
import { calculateDailyRange } from '@/lib/pacing';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const today = new Date().toISOString().slice(0, 10);

  const session = await assembleDailySession(supabase, getAnthropicClient(), today);

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('session_id', session.id);

  const { data: vocab } = await supabase
    .from('vocab_of_the_day')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  const { data: books } = await supabase.from('books').select('*');
  const bookRanges = (books ?? []).map((b: any) => {
    const range = calculateDailyRange({
      totalPages: b.total_pages,
      examDate: b.exam_date,
      today,
      targetReadCount: b.target_read_count,
      currentReadCount: b.current_read_count,
      currentPage: b.current_page,
    });
    return { bookId: b.id, name: b.name, startPage: range.startPage, endPage: range.endPage };
  });

  return NextResponse.json({ session, questions: questions ?? [], vocab, bookRanges });
}
```

- [ ] **Step 2: 실패하는 프론트엔드 테스트 작성**

```tsx
// src/app/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from './page';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/session/today') {
        return {
          ok: true,
          json: async () => ({
            session: { id: 's1', essay_book_id: 'b1' },
            questions: [
              {
                id: 'q1',
                book_id: 'b1',
                type: 'grammar',
                prompt: '把자문의 어순은?',
                choices: ['A', 'B'],
                source_page: 12,
              },
              {
                id: 'q2',
                book_id: 'b1',
                type: 'essay',
                prompt: '루쉰 문학의 특징을 서술하시오',
                choices: null,
                source_page: 30,
              },
            ],
            vocab: { word_zh: '内卷', pinyin: 'nèijuǎn', meaning_ko: '내권' },
            bookRanges: [{ bookId: 'b1', name: '문법', startPage: 1, endPage: 10 }],
          }),
        } as any;
      }
      if (url === '/api/attempts') {
        return { ok: true, json: async () => ({ isCorrect: false, explanation: '설명', sourcePage: 12 }) } as any;
      }
      if (url === '/api/attempts/essay') {
        return {
          ok: true,
          json: async () => ({ contentScore: 75, chineseScore: 55, feedback: '표현 개선 필요' }),
        } as any;
      }
      throw new Error(`unhandled fetch: ${url}`);
    })
  );
});

describe('Daily session page', () => {
  it('loads today\'s questions and shows the explanation after an answer is submitted', async () => {
    render(<Page />);

    expect(await screen.findByText('把자문의 어순은?')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('A'));

    await waitFor(() => expect(screen.getByText(/설명/)).toBeInTheDocument());
    expect(screen.getByText(/12페이지/)).toBeInTheDocument();
  });

  it('shows the AI-curated vocab of the day labeled as AI content', async () => {
    render(<Page />);

    expect(await screen.findByText('内卷')).toBeInTheDocument();
    expect(screen.getByText(/AI 큐레이션/)).toBeInTheDocument();
  });

  it('shows today\'s reading range per book', async () => {
    render(<Page />);

    expect(await screen.findByText(/문법: 1~10페이지/)).toBeInTheDocument();
  });

  it('submits the two-stage essay answer and shows separate content/Chinese scores', async () => {
    render(<Page />);

    const [koreanBox, chineseBox] = await screen.findAllByRole('textbox');
    const user = userEvent.setup();
    await user.type(koreanBox, '루쉰은 사실주의 기법으로...');
    await user.type(chineseBox, '鲁迅用现实主义手法...');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText(/75점/)).toBeInTheDocument());
    expect(screen.getByText(/55점/)).toBeInTheDocument();
    expect(screen.getByText(/표현 개선 필요/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/app/page.test.tsx`
Expected: FAIL (테스트가 기대하는 텍스트/구조가 아직 없음)

- [ ] **Step 4: `@testing-library/user-event` 설치**

```bash
npm install -D @testing-library/user-event
```

- [ ] **Step 5: 데일리 세션 페이지 구현**

```tsx
// src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';

interface Question {
  id: string;
  book_id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  source_page: number;
}

interface Vocab {
  word_zh: string;
  pinyin: string;
  meaning_ko: string;
}

interface BookRange {
  bookId: string;
  name: string;
  startPage: number;
  endPage: number;
}

interface SessionData {
  session: { id: string; essay_book_id: string };
  questions: Question[];
  vocab: Vocab | null;
  bookRanges: BookRange[];
}

type QuizFeedback = 'correct' | { explanation: string; sourcePage: number };
interface EssayFeedback {
  contentScore: number;
  chineseScore: number;
  feedback: string;
}

export default function Page() {
  const [data, setData] = useState<SessionData | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<Record<string, QuizFeedback>>({});
  const [essayFeedback, setEssayFeedback] = useState<Record<string, EssayFeedback>>({});
  const [koreanDrafts, setKoreanDrafts] = useState<Record<string, string>>({});
  const [chineseAnswers, setChineseAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/session/today')
      .then((res) => res.json())
      .then(setData);
  }, []);

  async function submitAnswer(questionId: string, userAnswer: string) {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, userAnswer }),
    });
    const result = await res.json();
    setQuizFeedback((prev) => ({
      ...prev,
      [questionId]: result.isCorrect
        ? 'correct'
        : { explanation: result.explanation, sourcePage: result.sourcePage },
    }));
  }

  async function submitEssay(questionId: string) {
    const res = await fetch('/api/attempts/essay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId,
        koreanDraft: koreanDrafts[questionId] ?? '',
        chineseAnswer: chineseAnswers[questionId] ?? '',
      }),
    });
    const result = await res.json();
    setEssayFeedback((prev) => ({ ...prev, [questionId]: result }));
  }

  if (!data) return <p>불러오는 중...</p>;

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h1>오늘의 학습</h1>

      <section>
        <h2>오늘의 회독 범위</h2>
        <ul>
          {data.bookRanges.map((r) => (
            <li key={r.bookId}>
              {r.name}: {r.startPage}~{r.endPage}페이지
            </li>
          ))}
        </ul>
      </section>

      {data.questions.map((q) => {
        if (q.type === 'essay') {
          const fb = essayFeedback[q.id];
          return (
            <section key={q.id} style={{ marginBottom: 24 }}>
              <p>{q.prompt}</p>
              <label>
                1단계: 한국어로 내용 정리
                <textarea
                  value={koreanDrafts[q.id] ?? ''}
                  onChange={(e) => setKoreanDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                />
              </label>
              <label>
                2단계: 중국어로 답안 작성
                <textarea
                  value={chineseAnswers[q.id] ?? ''}
                  onChange={(e) => setChineseAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                />
              </label>
              <button onClick={() => submitEssay(q.id)}>제출</button>
              {fb && (
                <p>
                  내용 정확도 {fb.contentScore}점 / 중국어 표현 {fb.chineseScore}점 — {fb.feedback}
                </p>
              )}
            </section>
          );
        }

        const fb = quizFeedback[q.id];
        return (
          <section key={q.id} style={{ marginBottom: 24 }}>
            <p>{q.prompt}</p>
            {(q.choices ?? []).map((choice) => (
              <button key={choice} onClick={() => submitAnswer(q.id, choice)} style={{ marginRight: 8 }}>
                {choice}
              </button>
            ))}
            {fb === 'correct' && <p>정답입니다</p>}
            {fb && fb !== 'correct' && (
              <p>
                {fb.explanation} ({fb.sourcePage}페이지 참고)
              </p>
            )}
          </section>
        );
      })}

      {data.vocab && (
        <section>
          <h2>오늘의 어휘 (AI 큐레이션)</h2>
          <p>
            {data.vocab.word_zh} ({data.vocab.pinyin}) — {data.vocab.meaning_ko}
          </p>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/app/page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 7: 개발 서버로 수동 확인**

Run: `npm run dev`, PIN 로그인 후 메인 페이지에서 오늘의 문제와 오늘의 어휘가
실제로 표시되는지, 오답 클릭 시 설명+출처 페이지가 나타나는지 확인한다.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/session src/app/page.tsx src/app/page.test.tsx package.json package-lock.json
git commit -m "feat: add daily session API route and main study page"
```

---

### Task 20: 실제 교재 인제스트 & 배포

**Files:**
- 없음 (운영 작업 태스크 — 실제 데이터 적재와 배포)

**Interfaces:**
- Consumes: Task 8의 `ingest:book`/`ingest:reference` npm 스크립트

- [ ] **Step 1: Supabase 프로젝트 생성 및 환경변수 설정**

supabase.com에서 새 프로젝트 생성 → Task 2의 마이그레이션 SQL 실행 → `.env.local`에
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` 채우기.

- [ ] **Step 2: Anthropic API 키 발급 및 설정**

console.anthropic.com에서 API 키 발급 → `.env.local`의 `ANTHROPIC_API_KEY`에 설정.
`APP_PIN`도 원하는 4자리 숫자로 설정.

- [ ] **Step 3: 전공중국어 3권 인제스트**

```bash
npm run ingest:book -- "C:\Users\user\Documents\카카오톡 받은 파일\전공중국어 문법.ocr.pdf" "문법" "2027-11-01" 3
npm run ingest:book -- "C:\Users\user\Documents\카카오톡 받은 파일\전공중국어_문학개론.ocr.pdf" "문학개론" "2027-11-01" 3
npm run ingest:book -- "C:\Users\user\Documents\카카오톡 받은 파일\전공중국어_어학개론.ocr.pdf" "어학개론" "2027-11-01" 3
```

(시험일은 실제 시험일로 교체)

- [ ] **Step 4: 기출문제 6종을 참고 자료로 인제스트**

```bash
npm run ingest:reference -- "C:\Users\user\Documents\카카오톡 받은 파일\기출문제2 답안 및 해설.pdf" "기출문제2"
npm run ingest:reference -- "C:\Users\user\Documents\카카오톡 받은 파일\이론 기출문제 1 답안 및 해설.pdf" "이론기출문제1"
npm run ingest:reference -- "C:\Users\user\Documents\카카오톡 받은 파일\교육_독해편 기출문제 2.pdf" "독해편기출문제2"
npm run ingest:reference -- "C:\Users\user\Documents\카카오톡 받은 파일\이론편 기출문제1.pdf" "이론편기출문제1"
npm run ingest:reference -- "C:\Users\user\Documents\카카오톡 받은 파일\독해기출 특강.ocr.pdf" "독해기출특강"
npm run ingest:reference -- "C:\Users\user\Documents\카카오톡 받은 파일\한번에 끝내는 임용고시 중국어 기출문제집 교과교육학.ocr.pdf" "교과교육학기출문제집"
```

- [ ] **Step 5: GitHub 저장소 생성 및 푸시**

```bash
gh repo create imyong-app --private --source=. --remote=origin
git push -u origin master
```

- [ ] **Step 6: Vercel 프로젝트 연결 및 배포**

vercel.com에서 GitHub 저장소(`imyong-app`) import → Task 1~19에서 사용한 환경변수를
모두 Vercel 프로젝트 설정에 등록 → 배포.

- [ ] **Step 7: 배포된 URL로 수동 E2E 확인**

휴대폰 브라우저와 데스크톱 브라우저 각각에서 배포 URL 접속 → PIN 로그인 → 오늘의
문제/오늘의 어휘가 표시되는지 → 오답 제출 시 설명+출처 페이지가 나오는지 확인한다.
