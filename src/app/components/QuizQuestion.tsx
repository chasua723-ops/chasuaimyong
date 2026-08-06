'use client';

import type { Question, QuizFeedback } from './types';
import styles from './session.module.css';

interface QuizQuestionProps {
  question: Question;
  index: number;
  feedback: QuizFeedback | undefined;
  onSubmit: (questionId: string, answer: string) => void;
  overcome?: boolean;
  attemptCount?: number;
}

export default function QuizQuestion({
  question,
  index,
  feedback,
  onSubmit,
  overcome = false,
  attemptCount,
}: QuizQuestionProps) {
  return (
    <div className={overcome ? `${styles.questionCard} ${styles.questionCardOvercome}` : styles.questionCard}>
      <div className={styles.questionPromptRow}>
        <p className={styles.questionPrompt}>
          Q{index}. {question.prompt}
        </p>
        {overcome && <span className={styles.overcomeBadge}>극복됨</span>}
      </div>
      <div className={styles.choiceList}>
        {(question.choices ?? []).map((choice) => (
          <button
            key={choice}
            className={styles.choiceButton}
            disabled={overcome}
            onClick={() => onSubmit(question.id, choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      {overcome && attemptCount !== undefined && (
        <p className={styles.overcomeMeta}>{attemptCount}번 시도 만에 정답</p>
      )}
      {feedback === 'correct' && <p className={styles.feedbackCorrect}>정답입니다</p>}
      {feedback && feedback !== 'correct' && (
        <p className={styles.feedbackWrong}>
          {feedback.explanation} ({feedback.sourcePage}페이지 참고)
        </p>
      )}
    </div>
  );
}
