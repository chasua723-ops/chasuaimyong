'use client';

import { useEffect, useState } from 'react';
import QuizQuestion from '../components/QuizQuestion';
import type { QuizFeedback } from '../components/types';
import styles from './notebook.module.css';

interface WrongNoteQuestion {
  id: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
  bookName: string;
  overcome: boolean;
  attemptCount: number;
}

interface WrongNoteGroup {
  type: string;
  label: string;
  outstandingCount: number;
  totalCount: number;
  questions: WrongNoteQuestion[];
}

export default function NotebookPage() {
  const [groups, setGroups] = useState<WrongNoteGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, QuizFeedback>>({});
  const [overcomeOverrides, setOvercomeOverrides] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notebook');
        if (!res.ok) throw new Error(`notebook request failed: ${res.status}`);
        const json = (await res.json()) as { groups: WrongNoteGroup[] };
        if (!cancelled) setGroups(json.groups);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('오답노트를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAnswer(questionId: string, userAnswer: string) {
    setSubmitting((prev) => ({ ...prev, [questionId]: true }));
    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswer }),
      });
      const result = await res.json();
      setFeedback((prev) => ({
        ...prev,
        [questionId]: result.isCorrect
          ? 'correct'
          : { explanation: result.explanation, sourcePage: result.sourcePage },
      }));
      if (result.isCorrect) {
        setOvercomeOverrides((prev) => ({ ...prev, [questionId]: true }));
      }
    } finally {
      setSubmitting((prev) => ({ ...prev, [questionId]: false }));
    }
  }

  if (error) return <p className={styles.page}>{error}</p>;
  if (!groups) return <p className={styles.page}>불러오는 중...</p>;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>오답노트</h1>

      {groups.length === 0 && <p className={styles.empty}>아직 오답이 없어요 🎉</p>}

      {groups.map((group) => {
        const liveOutstandingCount = group.questions.filter(
          (q) => !(overcomeOverrides[q.id] ?? q.overcome)
        ).length;
        const percentage =
          group.totalCount === 0 ? 0 : Math.round((liveOutstandingCount / group.totalCount) * 100);

        return (
          <section key={group.type} className={styles.group}>
            <div className={styles.groupHeader}>
              <span className={styles.groupLabel}>{group.label}</span>
              <span className={styles.groupStat}>
                {liveOutstandingCount}/{group.totalCount} 미해결 ({percentage}%)
              </span>
            </div>

            {group.questions.map((q, i) => (
              <QuizQuestion
                key={q.id}
                question={{
                  id: q.id,
                  book_id: '',
                  type: group.type,
                  prompt: q.prompt,
                  choices: q.choices,
                  source_page: q.sourcePage,
                }}
                index={i + 1}
                feedback={feedback[q.id]}
                onSubmit={submitAnswer}
                overcome={overcomeOverrides[q.id] ?? q.overcome}
                attemptCount={overcomeOverrides[q.id] ? q.attemptCount + 1 : q.attemptCount}
                submitting={submitting[q.id] ?? false}
              />
            ))}
          </section>
        );
      })}
    </main>
  );
}
