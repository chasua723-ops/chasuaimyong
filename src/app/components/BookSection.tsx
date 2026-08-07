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
  onSubmitQuiz: (questionId: string, answer: string) => void;
  koreanDraft: string;
  chineseAnswer: string;
  essayFeedback: EssayFeedback | undefined;
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
  onSubmitQuiz,
  koreanDraft,
  chineseAnswer,
  essayFeedback,
  onKoreanChange,
  onChineseChange,
  onSubmitEssay,
}: BookSectionProps) {
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [practiceFeedback, setPracticeFeedback] = useState<Record<string, QuizFeedback>>({});
  const [generating, setGenerating] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

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
  }

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
        />
      )}
    </section>
  );
}
