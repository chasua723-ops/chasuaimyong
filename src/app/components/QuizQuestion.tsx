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
