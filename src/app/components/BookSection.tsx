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
