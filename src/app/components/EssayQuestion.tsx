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
