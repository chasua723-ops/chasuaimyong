'use client';

import { useEffect, useState } from 'react';
import CoverScreen from './components/CoverScreen';
import BookSection from './components/BookSection';
import SessionTimer from './components/SessionTimer';
import VocabCard from './components/VocabCard';
import type { SessionData, QuizFeedback, EssayFeedback } from './components/types';
import styles from './page.module.css';

export default function Page() {
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<Record<string, QuizFeedback>>({});
  const [essayFeedback, setEssayFeedback] = useState<Record<string, EssayFeedback>>({});
  const [koreanDrafts, setKoreanDrafts] = useState<Record<string, string>>({});
  const [chineseAnswers, setChineseAnswers] = useState<Record<string, string>>({});
  const [quizSubmitting, setQuizSubmitting] = useState<Record<string, boolean>>({});
  const [essaySubmitting, setEssaySubmitting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/session/today');
        if (!res.ok) throw new Error(`session request failed: ${res.status}`);
        const json = (await res.json()) as SessionData;
        if (cancelled) return;

        setData(json);

        const questionById = new Map(json.questions.map((q) => [q.id, q]));
        const quizFeedbackInit: Record<string, QuizFeedback> = {};
        const essayFeedbackInit: Record<string, EssayFeedback> = {};
        const koreanDraftsInit: Record<string, string> = {};
        const chineseAnswersInit: Record<string, string> = {};

        for (const attempt of json.attempts ?? []) {
          const question = questionById.get(attempt.question_id);
          if (!question) continue;

          if (question.type === 'essay') {
            koreanDraftsInit[attempt.question_id] = attempt.korean_draft ?? '';
            chineseAnswersInit[attempt.question_id] = attempt.chinese_answer ?? '';
            if (attempt.concept_score !== null) {
              essayFeedbackInit[attempt.question_id] = {
                conceptScore: attempt.concept_score,
                conceptChecklist: attempt.concept_checklist ?? [],
                grammarCorrections: attempt.grammar_corrections ?? [],
              };
            }
          } else if (attempt.is_correct !== null) {
            quizFeedbackInit[attempt.question_id] = attempt.is_correct
              ? 'correct'
              : { explanation: attempt.explanation ?? '', sourcePage: question.source_page };
          }
        }

        setQuizFeedback(quizFeedbackInit);
        setEssayFeedback(essayFeedbackInit);
        setKoreanDrafts(koreanDraftsInit);
        setChineseAnswers(chineseAnswersInit);
        if (json.attempts && json.attempts.length > 0) {
          setStarted(true);
          const earliest = Math.min(
            ...json.attempts.map((a) => new Date(a.created_at).getTime())
          );
          setStartedAt(earliest);
        }
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
    setQuizSubmitting((prev) => ({ ...prev, [questionId]: true }));
    try {
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
    } finally {
      setQuizSubmitting((prev) => ({ ...prev, [questionId]: false }));
    }
  }

  async function submitEssay(questionId: string) {
    setEssaySubmitting((prev) => ({ ...prev, [questionId]: true }));
    try {
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
    } finally {
      setEssaySubmitting((prev) => ({ ...prev, [questionId]: false }));
    }
  }

  if (error) return <p className={styles.page}>{error}</p>;
  if (!data) return <p className={styles.page}>불러오는 중...</p>;

  if (!started) {
    return (
      <main className={styles.page}>
        <CoverScreen
          bookRanges={data.bookRanges}
          onStart={() => {
            setStarted(true);
            setStartedAt(Date.now());
          }}
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {startedAt !== null && <SessionTimer startedAt={startedAt} />}
      {data.bookRanges.map((range) => {
        const bookQuestions = data.questions.filter((q) => q.book_id === range.bookId);
        const quizQuestions = bookQuestions.filter((q) => q.type !== 'essay');
        const essayQuestion = bookQuestions.find((q) => q.type === 'essay');

        return (
          <BookSection
            key={range.bookId}
            bookId={range.bookId}
            name={range.name}
            startPage={range.startPage}
            endPage={range.endPage}
            quizQuestions={quizQuestions}
            essayQuestion={essayQuestion}
            quizFeedback={quizFeedback}
            quizSubmitting={quizSubmitting}
            onSubmitQuiz={submitAnswer}
            koreanDraft={essayQuestion ? koreanDrafts[essayQuestion.id] ?? '' : ''}
            chineseAnswer={essayQuestion ? chineseAnswers[essayQuestion.id] ?? '' : ''}
            essayFeedback={essayQuestion ? essayFeedback[essayQuestion.id] : undefined}
            essaySubmitting={essayQuestion ? essaySubmitting[essayQuestion.id] ?? false : false}
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
