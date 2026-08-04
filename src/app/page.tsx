'use client';

import { useEffect, useState } from 'react';

interface Question {
  id: string;
  book_id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  source_page: number;
}

interface Vocab {
  word_zh: string;
  pinyin: string;
  meaning_ko: string;
}

interface BookRange {
  bookId: string;
  name: string;
  startPage: number;
  endPage: number;
}

interface SessionData {
  session: { id: string; essay_book_id: string };
  questions: Question[];
  vocab: Vocab | null;
  bookRanges: BookRange[];
}

type QuizFeedback = 'correct' | { explanation: string; sourcePage: number };
interface EssayFeedback {
  contentScore: number;
  chineseScore: number;
  feedback: string;
}

export default function Page() {
  const [data, setData] = useState<SessionData | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<Record<string, QuizFeedback>>({});
  const [essayFeedback, setEssayFeedback] = useState<Record<string, EssayFeedback>>({});
  const [koreanDrafts, setKoreanDrafts] = useState<Record<string, string>>({});
  const [chineseAnswers, setChineseAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/session/today')
      .then((res) => res.json())
      .then(setData);
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

  if (!data) return <p>불러오는 중...</p>;

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h1>오늘의 학습</h1>

      <section>
        <h2>오늘의 회독 범위</h2>
        <ul>
          {data.bookRanges.map((r) => (
            <li key={r.bookId}>
              {r.name}: {r.startPage}~{r.endPage}페이지
            </li>
          ))}
        </ul>
      </section>

      {data.questions.map((q) => {
        if (q.type === 'essay') {
          const fb = essayFeedback[q.id];
          return (
            <section key={q.id} style={{ marginBottom: 24 }}>
              <p>{q.prompt}</p>
              <label>
                1단계: 한국어로 내용 정리
                <textarea
                  value={koreanDrafts[q.id] ?? ''}
                  onChange={(e) => setKoreanDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                />
              </label>
              <label>
                2단계: 중국어로 답안 작성
                <textarea
                  value={chineseAnswers[q.id] ?? ''}
                  onChange={(e) => setChineseAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                />
              </label>
              <button onClick={() => submitEssay(q.id)}>제출</button>
              {fb && (
                <p>
                  내용 정확도 {fb.contentScore}점 / 중국어 표현 {fb.chineseScore}점 — {fb.feedback}
                </p>
              )}
            </section>
          );
        }

        const fb = quizFeedback[q.id];
        return (
          <section key={q.id} style={{ marginBottom: 24 }}>
            <p>{q.prompt}</p>
            {(q.choices ?? []).map((choice) => (
              <button key={choice} onClick={() => submitAnswer(q.id, choice)} style={{ marginRight: 8 }}>
                {choice}
              </button>
            ))}
            {fb === 'correct' && <p>정답입니다</p>}
            {fb && fb !== 'correct' && (
              <p>
                {fb.explanation} ({fb.sourcePage}페이지 참고)
              </p>
            )}
          </section>
        );
      })}

      {data.vocab && (
        <section>
          <h2>오늘의 어휘 (AI 큐레이션)</h2>
          <p>
            <strong>{data.vocab.word_zh}</strong> ({data.vocab.pinyin}) — {data.vocab.meaning_ko}
          </p>
        </section>
      )}
    </main>
  );
}
