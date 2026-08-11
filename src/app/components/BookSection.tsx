// src/app/components/BookSection.tsx
'use client';

import { useState } from 'react';
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

interface PracticeQuestion {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

interface BookSectionProps {
  bookId: string;
  name: string;
  startPage: number;
  endPage: number;
  quizQuestions: Question[];
  essayQuestion: Question | undefined;
  quizFeedback: Record<string, QuizFeedback>;
  quizSubmitting?: Record<string, boolean>;
  onSubmitQuiz: (questionId: string, answer: string) => void;
  koreanDraft: string;
  chineseAnswer: string;
  essayFeedback: EssayFeedback | undefined;
  essaySubmitting?: boolean;
  onKoreanChange: (value: string) => void;
  onChineseChange: (value: string) => void;
  onSubmitEssay: () => void;
}

export default function BookSection({
  bookId,
  name,
  startPage,
  endPage,
  quizQuestions,
  essayQuestion,
  quizFeedback,
  quizSubmitting = {},
  onSubmitQuiz,
  koreanDraft,
  chineseAnswer,
  essayFeedback,
  essaySubmitting = false,
  onKoreanChange,
  onChineseChange,
  onSubmitEssay,
}: BookSectionProps) {
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [practiceFeedback, setPracticeFeedback] = useState<Record<string, QuizFeedback>>({});
  const [practiceSubmitting, setPracticeSubmitting] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [range, setRange] = useState({ startPage, endPage });
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [justAdvanced, setJustAdvanced] = useState(false);

  async function confirmProgress() {
    setAdvancing(true);
    setAdvanceError(null);
    setJustAdvanced(false);
    try {
      const res = await fetch('/api/progress/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        setAdvanceError('진도를 갱신하지 못했어요. 다시 시도해주세요.');
        return;
      }
      const result = await res.json();
      setRange({ startPage: result.range.startPage, endPage: result.range.endPage });
      setJustAdvanced(true);
    } finally {
      setAdvancing(false);
    }
  }

  async function requestMorePractice() {
    setGenerating(true);
    setPracticeError(null);
    try {
      const res = await fetch('/api/quiz-practice/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        setPracticeError('새 문제를 만들지 못했어요. 다시 시도해주세요.');
        return;
      }
      const question = (await res.json()) as PracticeQuestion;
      setPracticeQuestions((prev) => [...prev, question]);
    } finally {
      setGenerating(false);
    }
  }

  async function submitPracticeAnswer(questionId: string, answer: string) {
    setPracticeSubmitting((prev) => ({ ...prev, [questionId]: true }));
    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswer: answer }),
      });
      const result = await res.json();
      setPracticeFeedback((prev) => ({
        ...prev,
        [questionId]: result.isCorrect
          ? 'correct'
          : { explanation: result.explanation, sourcePage: result.sourcePage },
      }));
    } finally {
      setPracticeSubmitting((prev) => ({ ...prev, [questionId]: false }));
    }
  }

  return (
    <section className={styles.bookSection}>
      <div className={styles.bookHeader}>
        <span className={styles.bookIcon}>{getBookIcon(name)}</span>
        <strong className={styles.bookName}>{name}</strong>
        <span className={styles.bookRangeBadge}>
          {range.startPage}~{range.endPage}p
        </span>
      </div>

      {quizQuestions.map((q, i) => (
        <QuizQuestion
          key={q.id}
          question={q}
          index={i + 1}
          feedback={quizFeedback[q.id]}
          onSubmit={onSubmitQuiz}
          submitting={quizSubmitting[q.id] ?? false}
          lockAfterAnswer
        />
      ))}

      {practiceQuestions.map((q, i) => (
        <QuizQuestion
          key={q.id}
          question={{
            id: q.id,
            book_id: bookId,
            type: q.type,
            prompt: q.prompt,
            choices: q.choices,
            source_page: q.sourcePage,
          }}
          index={quizQuestions.length + i + 1}
          feedback={practiceFeedback[q.id]}
          onSubmit={submitPracticeAnswer}
          submitting={practiceSubmitting[q.id] ?? false}
          lockAfterAnswer
        />
      ))}

      <button className={styles.morePracticeButton} onClick={requestMorePractice} disabled={generating}>
        더 풀기
      </button>
      {generating && <p className={styles.morePracticeLoading}>문제 만드는 중...</p>}
      {practiceError && <p className={styles.morePracticeError}>{practiceError}</p>}

      {essayQuestion && (
        <EssayQuestion
          question={essayQuestion}
          koreanDraft={koreanDraft}
          chineseAnswer={chineseAnswer}
          feedback={essayFeedback}
          onKoreanChange={onKoreanChange}
          onChineseChange={onChineseChange}
          onSubmit={onSubmitEssay}
          submitting={essaySubmitting}
        />
      )}

      <button className={styles.confirmProgressButton} onClick={confirmProgress} disabled={advancing}>
        오늘 분량 다 읽었어요
      </button>
      {advancing && <p className={styles.morePracticeLoading}>진도 갱신 중...</p>}
      {justAdvanced && !advancing && (
        <p className={styles.progressConfirmed}>진도가 갱신됐어요. 다음은 {range.startPage}~{range.endPage}p예요.</p>
      )}
      {advanceError && <p className={styles.morePracticeError}>{advanceError}</p>}
    </section>
  );
}
