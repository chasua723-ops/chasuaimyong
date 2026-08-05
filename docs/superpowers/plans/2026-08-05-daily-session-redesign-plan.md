# 오늘의 학습 화면 UI 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "오늘의 학습" 화면을 표지→본문 2단계 흐름, 교재별 섹션 구분, 문제 번호, 새 색상/폰트
시스템으로 재설계해서 가독성을 크게 개선한다.

**Architecture:** `page.tsx`를 얇은 컨테이너로 남기고, 표지 화면·교재 섹션·퀴즈 문제·서술형
문제·어휘 카드를 각각 별도 컴포넌트로 분리한다. 스타일은 새 npm 의존성 없이 CSS Modules +
CSS 변수로 구현하고, 폰트는 Pretendard를 CDN링크로 로드한다.

**Tech Stack:** Next.js (React, TypeScript), CSS Modules, Vitest + Testing Library (기존
스택 그대로, 새 의존성 추가 없음).

## Global Constraints

- 화면 흐름은 반드시 표지(날짜+오늘의 회독 범위+시작하기 버튼) → "시작하기" 클릭 →
  본문(교재별 문제) 2단계여야 한다.
- 배경색 `#fbfaf7`, 포인트색(틸) `#0f9488`, 폰트 Pretendard를 사용한다.
- 문제는 교재별(문법→문학개론→어학개론 순, `bookRanges` 배열 순서를 그대로 따름) 섹션으로
  구분하고, 각 섹션 내부에서 Q1, Q2... 순번을 붙인다 (전체 통합 번호가 아니라 섹션 내부 순번).
- 객관식 보기는 세로로 하나씩 나열한다 (가로 나열 금지).
- 서술형 문제는 "서술형" 뱃지 + 점선 구분으로 시각적으로 분리하고, 1단계(한국어)/2단계
  (중국어) 입력창과 제출 버튼을 그대로 유지한다. `/api/attempts/essay`로 `koreanDraft`/
  `chineseAnswer`를 보내고 `contentScore`/`chineseScore`/`feedback`을 받는 기존 계약은
  변경하지 않는다.
- 오늘의 어휘는 "AI 큐레이션" 뱃지로 교재 근거 콘텐츠와 명확히 구분한다.
- `/api/session/today`가 반환하는 `{ session, questions, vocab, bookRanges }` 응답 형태는
  변경하지 않는다 — 프론트 컴포넌트 구조만 재정리한다.
- Tailwind 등 새 스타일링 의존성을 추가하지 않는다. CSS Modules로 구현한다.
- 다크모드는 이번 스코프 밖이다 — 기존 `globals.css`의 다크모드 오버라이드는 (새 라이트
  전용 팔레트와 충돌하는) 제거 대상이며, 후속 작업으로 남긴다.

---

## File Structure

```
src/app/
  layout.tsx                          (수정 — Pretendard 폰트, 메타데이터)
  globals.css                         (수정 — 색상 변수, 다크모드 제거)
  page.tsx                            (수정 — 얇은 컨테이너로 재작성)
  page.module.css                     (수정 — 스캐폴딩 잔재 제거, 최소 레이아웃만)
  page.test.tsx                       (수정 — 표지→시작→본문 흐름 통합 테스트로 재작성)
  components/
    types.ts                         (신규 — 공유 타입)
    session.module.css               (신규 — 표지/섹션/문제/어휘 공통 스타일)
    VocabCard.tsx / .test.tsx         (신규)
    QuizQuestion.tsx / .test.tsx      (신규)
    EssayQuestion.tsx / .test.tsx     (신규)
    BookSection.tsx / .test.tsx       (신규)
    CoverScreen.tsx / .test.tsx       (신규)
```

---

### Task 1: 폰트 & 색상 시스템 설정

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: CSS 변수 `--background`, `--foreground`, `--accent`, `--accent-foreground`,
  `--text-secondary`, `--card-background`, `--card-border`, `--notebook-line`,
  `--badge-background`, `--vocab-background`, `--vocab-border` — 이후 모든 컴포넌트의
  `session.module.css`(Task 2)가 이 변수들을 그대로 사용한다.

이 태스크는 순수 CSS/마크업 변경이라 전용 자동 테스트가 없다 — `npm run dev`로 직접
확인한다.

- [ ] **Step 1: `globals.css`를 새 팔레트로 교체**

```css
/* src/app/globals.css */
:root {
  --background: #fbfaf7;
  --foreground: #3a352c;
  --accent: #0f9488;
  --accent-foreground: #ffffff;
  --text-secondary: #9a9284;
  --card-background: #ffffff;
  --card-border: #f0ede6;
  --notebook-line: #f2e9da;
  --badge-background: #e9f5f3;
  --vocab-background: #fbf6ec;
  --vocab-border: #eee0c8;
}

html {
  height: 100%;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--foreground);
  background: var(--background);
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}
```

(기존의 `@media (prefers-color-scheme: dark)` 블록 2개는 완전히 제거한다 — 다크모드는
이번 스코프 밖이며, 남겨두면 카드 배경 등 새로 추가되는 CSS 변수와 충돌해 반쪽짜리
다크모드가 된다.)

- [ ] **Step 2: `layout.tsx`에 Pretendard 폰트 링크와 메타데이터 추가**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '임용고시 중국어',
  description: '매일 15분, 임용고시 중국어 대비 학습 앱',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

(기존 `Geist`/`Geist_Mono` `next/font/google` import와 `className` 적용은 제거한다 —
Pretendard로 대체되므로 더 이상 쓰이지 않는다.)

- [ ] **Step 3: 개발 서버로 수동 확인**

Run: `npm run dev`, 브라우저에서 페이지를 열어 배경색이 뽀얀 화이트로, 폰트가
Pretendard(둥근 한글 글꼴)로 바뀌었는지 확인한다. (이 시점엔 `page.tsx`가 아직 옛
컴포넌트를 쓰고 있어 레이아웃 자체는 안 바뀐 것처럼 보일 수 있다 — 색상/폰트만 확인.)

- [ ] **Step 4: 기존 테스트 스위트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: 기존 68개 테스트 그대로 통과 (이 태스크는 `page.tsx`를 건드리지 않음)

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: apply new color palette and Pretendard font"
```

---

### Task 2: 공유 타입 + 오늘의 어휘 카드

**Files:**
- Create: `src/app/components/types.ts`
- Create: `src/app/components/session.module.css`
- Create: `src/app/components/VocabCard.tsx`
- Test: `src/app/components/VocabCard.test.tsx`

**Interfaces:**
- Consumes: Task 1의 CSS 변수
- Produces: `Question`, `Vocab`, `BookRange`, `SessionData`, `QuizFeedback`, `EssayFeedback`
  타입 (이후 모든 컴포넌트와 Task 7의 `page.tsx`가 이 파일에서 import). `session.module.css`의
  전체 클래스 세트 (이후 태스크들이 이미 정의된 클래스를 그대로 사용, 새로 추가하지 않음).
  `VocabCard(props: { vocab: Vocab })` 컴포넌트.

- [ ] **Step 1: 공유 타입 파일 작성**

```ts
// src/app/components/types.ts
export interface Question {
  id: string;
  book_id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  source_page: number;
}

export interface Vocab {
  word_zh: string;
  pinyin: string;
  meaning_ko: string;
}

export interface BookRange {
  bookId: string;
  name: string;
  startPage: number;
  endPage: number;
}

export interface SessionData {
  session: { id: string; essay_book_id: string };
  questions: Question[];
  vocab: Vocab | null;
  bookRanges: BookRange[];
}

export type QuizFeedback = 'correct' | { explanation: string; sourcePage: number };

export interface EssayFeedback {
  contentScore: number;
  chineseScore: number;
  feedback: string;
}
```

- [ ] **Step 2: 공통 스타일시트 작성 (이후 모든 컴포넌트가 사용)**

```css
/* src/app/components/session.module.css */

/* 표지 */
.cover {
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}

.coverDate {
  font-size: 11px;
  color: var(--text-secondary);
  letter-spacing: 1.5px;
}

.coverTitle {
  font-size: 22px;
  font-weight: 700;
  margin: 4px 0 16px;
}

.coverRanges {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 24px;
  width: 100%;
  max-width: 280px;
  text-align: left;
}

.coverRangeItem {
  font-size: 13px;
  color: var(--foreground);
  margin-bottom: 6px;
}

.coverRangeItem:last-child {
  margin-bottom: 0;
}

.startButton {
  background: var(--accent);
  color: var(--accent-foreground);
  border: none;
  border-radius: 10px;
  padding: 12px 32px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

/* 교재 섹션 */
.bookSection {
  margin-bottom: 28px;
}

.bookHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.bookIcon {
  font-size: 15px;
}

.bookName {
  font-size: 14px;
  font-weight: 700;
  color: var(--foreground);
}

.bookRangeBadge {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--badge-background);
  padding: 2px 9px;
  border-radius: 999px;
}

/* 문제 카드 (노트 줄무늬 포함) */
.questionCard {
  background: var(--card-background);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent,
    transparent 26px,
    var(--notebook-line) 27px
  );
  background-position: 0 34px;
}

.questionPrompt {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.choiceList {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.choiceButton {
  background: var(--background);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  color: var(--foreground);
}

.feedbackCorrect {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent);
}

.feedbackWrong {
  margin-top: 8px;
  font-size: 12px;
  color: var(--foreground);
}

/* 서술형 */
.essayWrapper {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--card-border);
}

.essayBadge {
  display: inline-block;
  font-size: 10px;
  color: var(--accent);
  background: var(--badge-background);
  padding: 2px 8px;
  border-radius: 6px;
  margin-bottom: 8px;
}

.essayPrompt {
  font-size: 13px;
  margin-bottom: 10px;
}

.essayStepLabel {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.essayTextarea {
  width: 100%;
  background: var(--background);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  font-family: inherit;
  min-height: 60px;
  resize: vertical;
  margin-bottom: 10px;
}

.essaySubmitButton {
  background: var(--accent);
  color: var(--accent-foreground);
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.essayFeedback {
  margin-top: 10px;
  font-size: 12px;
}

/* 오늘의 어휘 */
.vocabCard {
  background: var(--vocab-background);
  border: 1px solid var(--vocab-border);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 8px;
}

.vocabHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.vocabBadge {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--badge-background);
  padding: 2px 7px;
  border-radius: 999px;
}

.vocabWord {
  font-size: 13px;
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

```tsx
// src/app/components/VocabCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VocabCard from './VocabCard';

describe('VocabCard', () => {
  it('renders the vocab word and labels it as AI-curated', () => {
    render(<VocabCard vocab={{ word_zh: '内卷', pinyin: 'nèi juǎn', meaning_ko: '내부 경쟁 심화' }} />);

    expect(screen.getByText('内卷')).toBeInTheDocument();
    expect(screen.getByText(/nèi juǎn/)).toBeInTheDocument();
    expect(screen.getByText(/내부 경쟁 심화/)).toBeInTheDocument();
    expect(screen.getByText('AI 큐레이션')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npx vitest run src/app/components/VocabCard.test.tsx`
Expected: FAIL (`VocabCard.tsx` module not found)

- [ ] **Step 5: 구현 작성**

```tsx
// src/app/components/VocabCard.tsx
import type { Vocab } from './types';
import styles from './session.module.css';

export default function VocabCard({ vocab }: { vocab: Vocab }) {
  return (
    <section className={styles.vocabCard}>
      <div className={styles.vocabHeader}>
        <strong>오늘의 어휘</strong>
        <span className={styles.vocabBadge}>AI 큐레이션</span>
      </div>
      <p className={styles.vocabWord}>
        <strong>{vocab.word_zh}</strong> ({vocab.pinyin}) — {vocab.meaning_ko}
      </p>
    </section>
  );
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/app/components/VocabCard.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add src/app/components/types.ts src/app/components/session.module.css src/app/components/VocabCard.tsx src/app/components/VocabCard.test.tsx
git commit -m "feat: add shared session types, stylesheet, and vocab card"
```

---

### Task 3: 퀴즈 문제 컴포넌트

**Files:**
- Create: `src/app/components/QuizQuestion.tsx`
- Test: `src/app/components/QuizQuestion.test.tsx`

**Interfaces:**
- Consumes: `Question`, `QuizFeedback`(Task 2 `types.ts`), `session.module.css`(Task 2)
- Produces: `QuizQuestion(props: { question: Question; index: number; feedback:
  QuizFeedback | undefined; onSubmit: (questionId: string, answer: string) => void })`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/app/components/QuizQuestion.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizQuestion from './QuizQuestion';
import type { Question } from './types';

const question: Question = {
  id: 'q1',
  book_id: 'b1',
  type: 'grammar',
  prompt: '把자문의 어순은?',
  choices: ['A', 'B'],
  source_page: 12,
};

describe('QuizQuestion', () => {
  it('renders the question with its section-local number and choices', () => {
    render(<QuizQuestion question={question} index={2} feedback={undefined} onSubmit={vi.fn()} />);

    expect(screen.getByText(/Q2\./)).toBeInTheDocument();
    expect(screen.getByText(/把자문의 어순은\?/)).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('calls onSubmit with the question id and chosen answer when a choice is clicked', async () => {
    const onSubmit = vi.fn();
    render(<QuizQuestion question={question} index={1} feedback={undefined} onSubmit={onSubmit} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('A'));

    expect(onSubmit).toHaveBeenCalledWith('q1', 'A');
  });

  it('shows the explanation and source page when the feedback is a wrong answer', () => {
    render(
      <QuizQuestion
        question={question}
        index={1}
        feedback={{ explanation: '설명입니다', sourcePage: 12 }}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(/설명입니다/)).toBeInTheDocument();
    expect(screen.getByText(/12페이지 참고/)).toBeInTheDocument();
  });

  it('shows a correct message when feedback is "correct"', () => {
    render(<QuizQuestion question={question} index={1} feedback="correct" onSubmit={vi.fn()} />);
    expect(screen.getByText('정답입니다')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/app/components/QuizQuestion.test.tsx`
Expected: FAIL (`QuizQuestion.tsx` module not found)

- [ ] **Step 3: 구현 작성**

```tsx
// src/app/components/QuizQuestion.tsx
'use client';

import type { Question, QuizFeedback } from './types';
import styles from './session.module.css';

interface QuizQuestionProps {
  question: Question;
  index: number;
  feedback: QuizFeedback | undefined;
  onSubmit: (questionId: string, answer: string) => void;
}

export default function QuizQuestion({ question, index, feedback, onSubmit }: QuizQuestionProps) {
  return (
    <div className={styles.questionCard}>
      <p className={styles.questionPrompt}>
        Q{index}. {question.prompt}
      </p>
      <div className={styles.choiceList}>
        {(question.choices ?? []).map((choice) => (
          <button key={choice} className={styles.choiceButton} onClick={() => onSubmit(question.id, choice)}>
            {choice}
          </button>
        ))}
      </div>
      {feedback === 'correct' && <p className={styles.feedbackCorrect}>정답입니다</p>}
      {feedback && feedback !== 'correct' && (
        <p className={styles.feedbackWrong}>
          {feedback.explanation} ({feedback.sourcePage}페이지 참고)
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/app/components/QuizQuestion.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/QuizQuestion.tsx src/app/components/QuizQuestion.test.tsx
git commit -m "feat: add quiz question component with per-section numbering"
```

---

### Task 4: 서술형 문제 컴포넌트

**Files:**
- Create: `src/app/components/EssayQuestion.tsx`
- Test: `src/app/components/EssayQuestion.test.tsx`

**Interfaces:**
- Consumes: `Question`, `EssayFeedback`(Task 2 `types.ts`), `session.module.css`(Task 2)
- Produces: `EssayQuestion(props: { question: Question; koreanDraft: string; chineseAnswer:
  string; feedback: EssayFeedback | undefined; onKoreanChange: (value: string) => void;
  onChineseChange: (value: string) => void; onSubmit: () => void })`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/app/components/EssayQuestion.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EssayQuestion from './EssayQuestion';
import type { Question } from './types';

const question: Question = {
  id: 'q2',
  book_id: 'b1',
  type: 'essay',
  prompt: '주제와 평언의 관계를 논술하시오',
  choices: null,
  source_page: 30,
};

describe('EssayQuestion', () => {
  it('renders a badge and both step labels', () => {
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={undefined}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('서술형')).toBeInTheDocument();
    expect(screen.getByText(/1단계/)).toBeInTheDocument();
    expect(screen.getByText(/2단계/)).toBeInTheDocument();
  });

  it('calls the change handlers separately for the Korean and Chinese textareas', async () => {
    const onKoreanChange = vi.fn();
    const onChineseChange = vi.fn();
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={undefined}
        onKoreanChange={onKoreanChange}
        onChineseChange={onChineseChange}
        onSubmit={vi.fn()}
      />
    );

    const [koreanBox, chineseBox] = screen.getAllByRole('textbox');
    const user = userEvent.setup();
    await user.type(koreanBox, '한');
    await user.type(chineseBox, '中');

    expect(onKoreanChange).toHaveBeenCalledWith('한');
    expect(onChineseChange).toHaveBeenCalledWith('中');
  });

  it('calls onSubmit when the submit button is clicked', async () => {
    const onSubmit = vi.fn();
    render(
      <EssayQuestion
        question={question}
        koreanDraft="초안"
        chineseAnswer="答案"
        feedback={undefined}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('제출'));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('shows separate content and Chinese scores when feedback is present', () => {
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={{ contentScore: 80, chineseScore: 60, feedback: '표현 개선 필요' }}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(/80점/)).toBeInTheDocument();
    expect(screen.getByText(/60점/)).toBeInTheDocument();
    expect(screen.getByText(/표현 개선 필요/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/app/components/EssayQuestion.test.tsx`
Expected: FAIL (`EssayQuestion.tsx` module not found)

- [ ] **Step 3: 구현 작성**

```tsx
// src/app/components/EssayQuestion.tsx
'use client';

import type { Question, EssayFeedback } from './types';
import styles from './session.module.css';

interface EssayQuestionProps {
  question: Question;
  koreanDraft: string;
  chineseAnswer: string;
  feedback: EssayFeedback | undefined;
  onKoreanChange: (value: string) => void;
  onChineseChange: (value: string) => void;
  onSubmit: () => void;
}

export default function EssayQuestion({
  question,
  koreanDraft,
  chineseAnswer,
  feedback,
  onKoreanChange,
  onChineseChange,
  onSubmit,
}: EssayQuestionProps) {
  return (
    <div className={styles.essayWrapper}>
      <span className={styles.essayBadge}>서술형</span>
      <p className={styles.essayPrompt}>{question.prompt}</p>

      <div className={styles.essayStepLabel}>1단계 · 한국어로 내용 정리</div>
      <textarea
        className={styles.essayTextarea}
        value={koreanDraft}
        onChange={(e) => onKoreanChange(e.target.value)}
      />

      <div className={styles.essayStepLabel}>2단계 · 중국어로 답안 작성</div>
      <textarea
        className={styles.essayTextarea}
        value={chineseAnswer}
        onChange={(e) => onChineseChange(e.target.value)}
      />

      <button className={styles.essaySubmitButton} onClick={onSubmit}>
        제출
      </button>

      {feedback && (
        <p className={styles.essayFeedback}>
          내용 정확도 {feedback.contentScore}점 / 중국어 표현 {feedback.chineseScore}점 — {feedback.feedback}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/app/components/EssayQuestion.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/EssayQuestion.tsx src/app/components/EssayQuestion.test.tsx
git commit -m "feat: add two-stage essay question component"
```

---

### Task 5: 교재 섹션 컴포넌트

**Files:**
- Create: `src/app/components/BookSection.tsx`
- Test: `src/app/components/BookSection.test.tsx`

**Interfaces:**
- Consumes: `Question`, `QuizFeedback`, `EssayFeedback`(Task 2), `QuizQuestion`(Task 3),
  `EssayQuestion`(Task 4), `session.module.css`(Task 2)
- Produces: `BookSection(props: { name: string; startPage: number; endPage: number;
  quizQuestions: Question[]; essayQuestion: Question | undefined; quizFeedback:
  Record<string, QuizFeedback>; onSubmitQuiz: (questionId: string, answer: string) => void;
  koreanDraft: string; chineseAnswer: string; essayFeedback: EssayFeedback | undefined;
  onKoreanChange: (value: string) => void; onChineseChange: (value: string) => void;
  onSubmitEssay: () => void })`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/app/components/BookSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookSection from './BookSection';
import type { Question } from './types';

const quizQuestions: Question[] = [
  { id: 'q1', book_id: 'b1', type: 'grammar', prompt: '문제1', choices: ['A', 'B'], source_page: 12 },
  { id: 'q2', book_id: 'b1', type: 'vocab', prompt: '문제2', choices: ['C', 'D'], source_page: 13 },
];

const essayQuestion: Question = {
  id: 'q3',
  book_id: 'b1',
  type: 'essay',
  prompt: '서술형 문제',
  choices: null,
  source_page: 30,
};

const noop = {
  onSubmitQuiz: vi.fn(),
  onKoreanChange: vi.fn(),
  onChineseChange: vi.fn(),
  onSubmitEssay: vi.fn(),
};

describe('BookSection', () => {
  it('renders the book icon, name, and page range', () => {
    render(
      <BookSection
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={quizQuestions}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('📘')).toBeInTheDocument();
    expect(screen.getByText('문법')).toBeInTheDocument();
    expect(screen.getByText('11~19p')).toBeInTheDocument();
  });

  it('numbers quiz questions starting from 1 within the section', () => {
    render(
      <BookSection
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={quizQuestions}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText(/Q1\./)).toBeInTheDocument();
    expect(screen.getByText(/Q2\./)).toBeInTheDocument();
  });

  it('falls back to a default icon for an unrecognized book name', () => {
    render(
      <BookSection
        name="새교재"
        startPage={1}
        endPage={5}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('📕')).toBeInTheDocument();
  });

  it('renders the essay question only when one is provided', () => {
    render(
      <BookSection
        name="문학개론"
        startPage={8}
        endPage={14}
        quizQuestions={[]}
        essayQuestion={essayQuestion}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('서술형')).toBeInTheDocument();
    expect(screen.getByText('서술형 문제')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/app/components/BookSection.test.tsx`
Expected: FAIL (`BookSection.tsx` module not found)

- [ ] **Step 3: 구현 작성**

```tsx
// src/app/components/BookSection.tsx
'use client';

import type { Question, QuizFeedback, EssayFeedback } from './types';
import QuizQuestion from './QuizQuestion';
import EssayQuestion from './EssayQuestion';
import styles from './session.module.css';

const BOOK_ICONS: Record<string, string> = {
  문법: '📘',
  문학개론: '📖',
  어학개론: '🗣️',
};

function getBookIcon(name: string): string {
  return BOOK_ICONS[name] ?? '📕';
}

interface BookSectionProps {
  name: string;
  startPage: number;
  endPage: number;
  quizQuestions: Question[];
  essayQuestion: Question | undefined;
  quizFeedback: Record<string, QuizFeedback>;
  onSubmitQuiz: (questionId: string, answer: string) => void;
  koreanDraft: string;
  chineseAnswer: string;
  essayFeedback: EssayFeedback | undefined;
  onKoreanChange: (value: string) => void;
  onChineseChange: (value: string) => void;
  onSubmitEssay: () => void;
}

export default function BookSection({
  name,
  startPage,
  endPage,
  quizQuestions,
  essayQuestion,
  quizFeedback,
  onSubmitQuiz,
  koreanDraft,
  chineseAnswer,
  essayFeedback,
  onKoreanChange,
  onChineseChange,
  onSubmitEssay,
}: BookSectionProps) {
  return (
    <section className={styles.bookSection}>
      <div className={styles.bookHeader}>
        <span className={styles.bookIcon}>{getBookIcon(name)}</span>
        <strong className={styles.bookName}>{name}</strong>
        <span className={styles.bookRangeBadge}>
          {startPage}~{endPage}p
        </span>
      </div>

      {quizQuestions.map((q, i) => (
        <QuizQuestion key={q.id} question={q} index={i + 1} feedback={quizFeedback[q.id]} onSubmit={onSubmitQuiz} />
      ))}

      {essayQuestion && (
        <EssayQuestion
          question={essayQuestion}
          koreanDraft={koreanDraft}
          chineseAnswer={chineseAnswer}
          feedback={essayFeedback}
          onKoreanChange={onKoreanChange}
          onChineseChange={onChineseChange}
          onSubmit={onSubmitEssay}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/app/components/BookSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/BookSection.tsx src/app/components/BookSection.test.tsx
git commit -m "feat: add book section component grouping quiz and essay questions"
```

---

### Task 6: 표지 화면 컴포넌트

**Files:**
- Create: `src/app/components/CoverScreen.tsx`
- Test: `src/app/components/CoverScreen.test.tsx`

**Interfaces:**
- Consumes: `BookRange`(Task 2), `session.module.css`(Task 2)
- Produces: `CoverScreen(props: { bookRanges: BookRange[]; onStart: () => void })`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/app/components/CoverScreen.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoverScreen from './CoverScreen';
import type { BookRange } from './types';

const bookRanges: BookRange[] = [
  { bookId: 'b1', name: '문법', startPage: 11, endPage: 19 },
  { bookId: 'b2', name: '문학개론', startPage: 8, endPage: 14 },
];

describe('CoverScreen', () => {
  it('renders the title and each book range', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    expect(screen.getByText('오늘의 학습')).toBeInTheDocument();
    expect(screen.getByText(/문법 · 11~19p/)).toBeInTheDocument();
    expect(screen.getByText(/문학개론 · 8~14p/)).toBeInTheDocument();
  });

  it('calls onStart when the start button is clicked', async () => {
    const onStart = vi.fn();
    render(<CoverScreen bookRanges={bookRanges} onStart={onStart} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('오늘의 학습 시작하기 →'));

    expect(onStart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/app/components/CoverScreen.test.tsx`
Expected: FAIL (`CoverScreen.tsx` module not found)

- [ ] **Step 3: 구현 작성**

```tsx
// src/app/components/CoverScreen.tsx
'use client';

import type { BookRange } from './types';
import styles from './session.module.css';

interface CoverScreenProps {
  bookRanges: BookRange[];
  onStart: () => void;
}

function formatToday(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

export default function CoverScreen({ bookRanges, onStart }: CoverScreenProps) {
  return (
    <div className={styles.cover}>
      <div className={styles.coverDate}>{formatToday()}</div>
      <h1 className={styles.coverTitle}>오늘의 학습</h1>
      <div className={styles.coverRanges}>
        {bookRanges.map((r) => (
          <div key={r.bookId} className={styles.coverRangeItem}>
            {r.name} · {r.startPage}~{r.endPage}p
          </div>
        ))}
      </div>
      <button className={styles.startButton} onClick={onStart}>
        오늘의 학습 시작하기 →
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/app/components/CoverScreen.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/CoverScreen.tsx src/app/components/CoverScreen.test.tsx
git commit -m "feat: add cover screen with today's ranges and start button"
```

---

### Task 7: 페이지 컨테이너 재작성 & 통합 테스트

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.module.css`
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `CoverScreen`(Task 6), `BookSection`(Task 5), `VocabCard`(Task 2),
  `SessionData`/`QuizFeedback`/`EssayFeedback`(Task 2)

이 태스크는 기존 `page.tsx`/`page.test.tsx`를 완전히 새 컴포넌트 구조로 교체한다. TDD
순서(RED→GREEN)는 테스트를 먼저 새 기대 동작으로 갈아끼우고, 그다음 구현을 교체하는
순서로 진행한다.

- [ ] **Step 1: `page.module.css`를 최소 레이아웃 전용으로 교체**

```css
/* src/app/page.module.css */
.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}
```

- [ ] **Step 2: 실패하는 통합 테스트로 `page.test.tsx` 전체 교체**

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
  it("shows the cover screen first, with today's book ranges and a start button", async () => {
    render(<Page />);

    expect(await screen.findByText('오늘의 학습')).toBeInTheDocument();
    expect(screen.getByText(/문법 · 1~10p/)).toBeInTheDocument();
    expect(screen.queryByText(/把자문의 어순은/)).not.toBeInTheDocument();
  });

  it('shows the book section with questions after clicking start', async () => {
    render(<Page />);

    const startButton = await screen.findByText('오늘의 학습 시작하기 →');
    const user = userEvent.setup();
    await user.click(startButton);

    expect(await screen.findByText(/把자문의 어순은\?/)).toBeInTheDocument();
    expect(screen.getByText(/Q1\./)).toBeInTheDocument();
  });

  it('shows the explanation and source page after answering a quiz question incorrectly', async () => {
    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));
    await user.click(await screen.findByText('A'));

    await waitFor(() => expect(screen.getByText(/설명/)).toBeInTheDocument());
    expect(screen.getByText(/12페이지 참고/)).toBeInTheDocument();
  });

  it('submits the two-stage essay answer and shows separate content/Chinese scores', async () => {
    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));

    const [koreanBox, chineseBox] = await screen.findAllByRole('textbox');
    await user.type(koreanBox, '루쉰은 사실주의 기법으로...');
    await user.type(chineseBox, '鲁迅用现实主义手法...');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText(/75점/)).toBeInTheDocument());
    expect(screen.getByText(/55점/)).toBeInTheDocument();
    expect(screen.getByText(/표현 개선 필요/)).toBeInTheDocument();
  });

  it('shows the AI-curated vocab of the day labeled as AI content, after starting', async () => {
    render(<Page />);

    await userEvent.setup().click(await screen.findByText('오늘의 학습 시작하기 →'));

    expect(await screen.findByText('内卷')).toBeInTheDocument();
    expect(screen.getByText('AI 큐레이션')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/app/page.test.tsx`
Expected: FAIL (옛 `page.tsx`는 표지 화면이 없어 "오늘의 학습 시작하기 →" 버튼을 찾지 못함)

- [ ] **Step 4: `page.tsx`를 새 컴포넌트 구조로 재작성**

```tsx
// src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import CoverScreen from './components/CoverScreen';
import BookSection from './components/BookSection';
import VocabCard from './components/VocabCard';
import type { SessionData, QuizFeedback, EssayFeedback } from './components/types';
import styles from './page.module.css';

export default function Page() {
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState<Record<string, QuizFeedback>>({});
  const [essayFeedback, setEssayFeedback] = useState<Record<string, EssayFeedback>>({});
  const [koreanDrafts, setKoreanDrafts] = useState<Record<string, string>>({});
  const [chineseAnswers, setChineseAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/session/today');
        if (!res.ok) throw new Error(`session request failed: ${res.status}`);
        const json = (await res.json()) as SessionData;
        if (!cancelled) setData(json);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('오늘 학습 콘텐츠를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
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

  if (error) return <p className={styles.page}>{error}</p>;
  if (!data) return <p className={styles.page}>불러오는 중...</p>;

  if (!started) {
    return (
      <main className={styles.page}>
        <CoverScreen bookRanges={data.bookRanges} onStart={() => setStarted(true)} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {data.bookRanges.map((range) => {
        const bookQuestions = data.questions.filter((q) => q.book_id === range.bookId);
        const quizQuestions = bookQuestions.filter((q) => q.type !== 'essay');
        const essayQuestion = bookQuestions.find((q) => q.type === 'essay');

        return (
          <BookSection
            key={range.bookId}
            name={range.name}
            startPage={range.startPage}
            endPage={range.endPage}
            quizQuestions={quizQuestions}
            essayQuestion={essayQuestion}
            quizFeedback={quizFeedback}
            onSubmitQuiz={submitAnswer}
            koreanDraft={essayQuestion ? koreanDrafts[essayQuestion.id] ?? '' : ''}
            chineseAnswer={essayQuestion ? chineseAnswers[essayQuestion.id] ?? '' : ''}
            essayFeedback={essayQuestion ? essayFeedback[essayQuestion.id] : undefined}
            onKoreanChange={(value) =>
              essayQuestion && setKoreanDrafts((prev) => ({ ...prev, [essayQuestion.id]: value }))
            }
            onChineseChange={(value) =>
              essayQuestion && setChineseAnswers((prev) => ({ ...prev, [essayQuestion.id]: value }))
            }
            onSubmitEssay={() => essayQuestion && submitEssay(essayQuestion.id)}
          />
        );
      })}

      {data.vocab && <VocabCard vocab={data.vocab} />}
    </main>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/app/page.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: 전체 스위트 실행**

Run: `npm test`
Expected: 모든 테스트 통과 (Task 2~6에서 추가된 컴포넌트 테스트 + 이 태스크의 통합
테스트 + 기존 lib 테스트 전부 그린)

- [ ] **Step 7: `tsc`/`lint` 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npx eslint src/app`
Expected: 새로 추가한 코드에서 새 에러 없음 (기존에 있던 `no-explicit-any` 관련 경고는
이 태스크 범위 밖이므로 무시)

- [ ] **Step 8: 개발 서버로 최종 수동 확인**

Run: `npm run dev`, 로그인 후 표지 화면 → 시작하기 → 교재별 섹션(색상은 아직 교재별
구분 없이 단일 틸 포인트 컬러 — 스펙에서 그렇게 확정함) → 오답 클릭 시 설명 표시 →
서술형 2단계 제출 → 오늘의 어휘까지 실제로 눌러보며 확인한다.

- [ ] **Step 9: Commit**

```bash
git add src/app/page.tsx src/app/page.module.css src/app/page.test.tsx
git commit -m "feat: rebuild daily session page with cover screen and component split"
```
