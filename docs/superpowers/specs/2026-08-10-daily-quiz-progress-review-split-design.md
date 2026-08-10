# 일일 퀴즈 진도/복습 분할 + 세션 타이머

## 배경

현재 각 교재마다 일일 세션에서 객관식 문제 3개가 전부 `[1, endPage]` (오늘까지 읽은 전체 범위)에서 랜덤으로 출제된다. 오늘 새로 배정된 분량(`[startPage, endPage]`)을 직접 겨냥한 문제가 없어서, 방금 읽은 내용에 대한 즉각적인 확인이 약하다.

## 변경 사항

### 1. 교재당 문제 수 3 → 10, 진도 5 + 복습 5

- `generateFromRandomPage.ts`에 `minPage` 옵션 추가 (기본값 1 — 기존 호출자인 더 풀기(`generateQuizPractice.ts`)는 그대로 동작).
- `assembleDailySession.ts`의 `generateQuestionsForBook`에서:
  - 진도 5문제: `minPage: range.startPage, maxPage: range.endPage`
  - 복습 5문제: `minPage: 1, maxPage: book.total_pages` — 아직 읽지 않은 뒷부분을 포함한 **교재 전체 범위**에서 출제 (기존의 "읽은 범위까지"(`range.endPage`)가 아님)
- 두 그룹을 합친 뒤 섞어서 저장 — 진도/복습을 화면에 구분해서 보여주지 않고 뒤섞인 순서로 출제 (UI 그룹 라벨 없음, DB에 구분 컬럼 추가 안 함).
- 교재별 총 문제 수는 3→10으로 늘어나 하루 학습 시간이 늘어날 수 있음 — 15분 제한을 강제하지 않는 대신 세션 타이머로 시각적 피드백만 제공.

### 2. 세션 타이머

- 새 컴포넌트 `SessionTimer` — "오늘의 학습 시작하기"를 누른 시점부터 카운트.
- `MM:SS / 15:00` 형식으로 표시, 15분 이내는 기본 색상.
- 15분을 넘으면 빨간색으로 전환되고 목표 시간 비교 없이 계속 카운트업 (예: `18:42`, 상한 없음).
- 매 초 `Date.now()` 기준으로 경과 시간을 재계산 (탭이 백그라운드로 가도 부정확해지지 않도록 누적 카운터 대신 타임스탬프 차이 사용).
- 세션 화면 상단에 고정 배지 형태로 표시.

### 범위 밖

- 더 풀기(온디맨드 연습), 서술형 문제/노트, 오답노트, 진도 확인 로직 — 전부 변경 없음.
- 교육학 교재는 이번 변경으로 자동으로 동일한 10문제(5+5) 패턴을 적용받음 (책 목록을 순회하는 기존 구조 덕분에 별도 작업 불필요). OCR은 439페이지 전부 완료됨.

## 영향받는 파일

- `src/lib/quiz/generateFromRandomPage.ts` — `minPage` 파라미터 추가
- `src/lib/session/assembleDailySession.ts` — 진도/복습 분할 + 셔플
- `src/app/components/SessionTimer.tsx` (신규) + 모듈 CSS
- `src/app/page.tsx` — 타이머 마운트

## 테스트

- `generateFromRandomPage`: `minPage`가 주어졌을 때 생성된 문제의 `sourcePage`가 항상 `[minPage, maxPage]` 범위 안에 있는지 (기존 테스트에 케이스 추가).
- 기존 회귀 테스트 전체 통과 확인 (`minPage` 미지정 시 기존 동작 그대로).
- 타이머 색상 전환은 코드 리뷰 + 임계값을 임시로 낮춰서 수동 확인 후 원복.
