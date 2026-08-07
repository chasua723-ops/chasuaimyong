'use client';

import type { Question, EssayFeedback } from './types';
import { containsChinese } from '@/lib/containsChinese';
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
      <p className={`${styles.essayPrompt}${containsChinese(question.prompt) ? ' zh' : ''}`}>
        {question.prompt}
      </p>

      <label className={styles.essayStepLabel} htmlFor={`ko-${question.id}`}>
        1단계 · 한국어로 내용 정리
      </label>
      <textarea
        id={`ko-${question.id}`}
        className={styles.essayTextarea}
        value={koreanDraft}
        onChange={(e) => onKoreanChange(e.target.value)}
      />

      <label className={styles.essayStepLabel} htmlFor={`zh-${question.id}`}>
        2단계 · 중국어로 답안 작성
      </label>
      <textarea
        id={`zh-${question.id}`}
        className={`${styles.essayTextarea} zh`}
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
