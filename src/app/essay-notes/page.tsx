'use client';

import { useEffect, useState } from 'react';
import EssayQuestion from '../components/EssayQuestion';
import type { EssayFeedback } from '../components/types';
import styles from './essay-notes.module.css';

interface ConceptCheck {
  concept: string;
  covered: boolean;
}

interface EssayNote {
  id: string;
  questionPrompt: string;
  bookName: string;
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
}

interface Book {
  id: string;
  name: string;
}

interface PracticeQuestion {
  id: string;
  prompt: string;
  sourcePage: number;
}

export default function EssayNotesPage() {
  const [notes, setNotes] = useState<EssayNote[] | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickingBook, setPickingBook] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null);
  const [koreanDraft, setKoreanDraft] = useState('');
  const [chineseAnswer, setChineseAnswer] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState<EssayFeedback | undefined>(undefined);
  const [grading, setGrading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/essay-notes');
        if (!res.ok) throw new Error(`essay notes request failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setNotes(json.notes);
          setBooks(json.books);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('서술형 노트를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startPractice(bookId: string) {
    setGenerating(true);
    setPracticeError(null);
    try {
      const res = await fetch('/api/essay-notes/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        setPracticeError('새 문제를 만들지 못했어요. 다시 시도해주세요.');
        return;
      }
      const question = await res.json();
      setPracticeQuestion(question);
      setPickingBook(false);
      setKoreanDraft('');
      setChineseAnswer('');
      setPracticeFeedback(undefined);
    } finally {
      setGenerating(false);
    }
  }

  async function submitPractice() {
    if (!practiceQuestion) return;
    setGrading(true);
    setPracticeError(null);
    try {
      const res = await fetch('/api/attempts/essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: practiceQuestion.id,
          koreanDraft,
          chineseAnswer,
        }),
      });
      if (!res.ok) {
        setPracticeError('채점하지 못했어요. 다시 시도해주세요.');
        return;
      }
      const result = await res.json();
      setPracticeFeedback(result);
      const notesRes = await fetch('/api/essay-notes');
      if (notesRes.ok) {
        const notesJson = await notesRes.json();
        setNotes(notesJson.notes);
      } else {
        console.error('Failed to refresh essay notes list:', notesRes.status);
      }
    } finally {
      setGrading(false);
    }
  }

  function startAnotherPractice() {
    setPracticeQuestion(null);
    setPracticeFeedback(undefined);
    setKoreanDraft('');
    setChineseAnswer('');
    setPracticeError(null);
  }

  if (error) return <p className={styles.page}>{error}</p>;
  if (!notes) return <p className={styles.page}>불러오는 중...</p>;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>서술형 노트</h1>

      {!practiceQuestion && !pickingBook && (
        <button className={styles.newButton} onClick={() => setPickingBook(true)}>
          새 문제 풀기
        </button>
      )}

      {pickingBook && !practiceQuestion && (
        <div className={styles.bookPicker}>
          {books.map((b) => (
            <button
              key={b.id}
              className={styles.bookOption}
              disabled={generating}
              onClick={() => startPractice(b.id)}
            >
              {b.name}
            </button>
          ))}
          {generating && <p className={styles.loading}>문제 만드는 중...</p>}
          {practiceError && <p className={styles.practiceError}>{practiceError}</p>}
        </div>
      )}

      {practiceQuestion && (
        <EssayQuestion
          question={{
            id: practiceQuestion.id,
            book_id: '',
            type: 'essay',
            prompt: practiceQuestion.prompt,
            choices: null,
            source_page: practiceQuestion.sourcePage,
          }}
          koreanDraft={koreanDraft}
          chineseAnswer={chineseAnswer}
          feedback={practiceFeedback}
          onKoreanChange={setKoreanDraft}
          onChineseChange={setChineseAnswer}
          onSubmit={submitPractice}
        />
      )}
      {grading && <p className={styles.loading}>채점 중...</p>}
      {practiceQuestion && practiceError && <p className={styles.practiceError}>{practiceError}</p>}
      {practiceQuestion && practiceFeedback && (
        <button className={styles.newButton} onClick={startAnotherPractice}>
          새 문제 더 풀기
        </button>
      )}

      <h2 className={styles.subtitle}>지난 답안</h2>
      {notes.length === 0 && <p className={styles.empty}>아직 제출한 서술형 답안이 없어요.</p>}
      {notes.map((note) => (
        <div key={note.id} className={styles.noteCard}>
          <p className={styles.noteBook}>{note.bookName}</p>
          <p className={`${styles.notePrompt} zh`}>{note.questionPrompt}</p>
          <p className={styles.noteScore}>{note.conceptScore}/4점</p>
          <ul className={styles.conceptChecklist}>
            {note.conceptChecklist.map((c, i) => (
              <li key={i} className={c.covered ? styles.conceptCovered : styles.conceptMissing}>
                {c.covered ? '✓' : '✗'} {c.concept}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}
