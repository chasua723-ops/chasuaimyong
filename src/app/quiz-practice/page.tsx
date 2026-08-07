'use client';

import { useEffect, useState } from 'react';
import { containsChinese } from '@/lib/containsChinese';
import styles from './quiz-practice.module.css';

const TYPE_LABELS: Record<string, string> = {
  grammar: '문법',
  vocab: '어휘',
  reading: '독해',
  theory: '이론',
};

interface QuizPracticeNote {
  id: string;
  bookName: string;
  type: string;
  prompt: string;
  userAnswer: string;
  isCorrect: boolean;
  sourcePage: number;
}

export default function QuizPracticePage() {
  const [notes, setNotes] = useState<QuizPracticeNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/quiz-practice');
        if (!res.ok) throw new Error(`quiz practice request failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setNotes(json.notes);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('더 풀기를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className={styles.page}>{error}</p>;
  if (!notes) return <p className={styles.page}>불러오는 중...</p>;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>더 풀기</h1>

      {notes.length === 0 && <p className={styles.empty}>아직 더 풀기로 만든 문제가 없어요.</p>}
      {notes.map((note) => (
        <div key={note.id} className={styles.noteCard}>
          <div className={styles.noteMeta}>
            <span className={styles.noteBook}>{note.bookName}</span>
            <span className={styles.noteType}>{TYPE_LABELS[note.type] ?? note.type}</span>
          </div>
          <p className={`${styles.notePrompt}${containsChinese(note.prompt) ? ' zh' : ''}`}>{note.prompt}</p>
          <p className={styles.noteAnswer}>내 답: {note.userAnswer}</p>
          <p className={note.isCorrect ? styles.noteCorrect : styles.noteWrong}>
            {note.isCorrect ? '정답' : '오답'} · {note.sourcePage}페이지 참고
          </p>
        </div>
      ))}
    </main>
  );
}
