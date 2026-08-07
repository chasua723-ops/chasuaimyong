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
            bookId={range.bookId}
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
