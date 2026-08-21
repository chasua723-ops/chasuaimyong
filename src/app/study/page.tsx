// src/app/study/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { containsChinese } from '@/lib/containsChinese';
import { loadPageState, savePageState } from '@/lib/localStorage/pageState';
import { groupTopics } from '@/lib/topics/groupTopics';
import QuizQuestion from '../components/QuizQuestion';
import type { QuizFeedback } from '../components/types';
import type { TopicRow } from '@/types/db';
import styles from './study.module.css';

interface Book {
  id: string;
  name: string;
}

interface TopicDetail {
  topic: { id: string; name: string; startPage: number; endPage: number };
  content: string;
  explanation: string | null;
}

interface PracticeQuestion {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

const STUDY_STATE_KEY = 'study-page';

interface StudyState {
  bookId: string;
  topicId: string;
}

export default function StudyPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [bookId, setBookId] = useState('');
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [topicId, setTopicId] = useState('');
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState(false);
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<QuizFeedback | undefined>(undefined);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [practiceSubmitting, setPracticeSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = loadPageState<StudyState>(STUDY_STATE_KEY);
    if (saved) {
      setBookId(saved.bookId ?? '');
      setTopicId(saved.topicId ?? '');
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    savePageState<StudyState>(STUDY_STATE_KEY, { bookId, topicId });
  }, [restored, bookId, topicId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/books');
        if (!res.ok) throw new Error(`books request failed: ${res.status}`);
        const json = await res.json();
        setBooks(json.books);
      } catch (err) {
        console.error(err);
        setBooksError('과목을 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
  }, []);

  useEffect(() => {
    if (!restored || !bookId) {
      setTopics([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/topics?bookId=${bookId}`);
        if (!res.ok) throw new Error(`topics request failed: ${res.status}`);
        const json = await res.json();
        setTopics(json.topics);
      } catch (err) {
        console.error(err);
        setTopicsError('주제를 불러오지 못했어요. 새로고침 해주세요.');
      }
    })();
  }, [restored, bookId]);

  useEffect(() => {
    if (!restored || !topicId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    setPracticeQuestion(null);
    setPracticeFeedback(undefined);
    setPracticeError(null);
    setPracticeSubmitting(false);
    (async () => {
      try {
        const res = await fetch(`/api/study/${topicId}`);
        if (!res.ok) throw new Error(`study detail request failed: ${res.status}`);
        const json = await res.json();
        setDetail(json);
      } catch (err) {
        console.error(err);
        setDetailError('학습 내용을 불러오지 못했어요. 새로고침 해주세요.');
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [restored, topicId]);

  function selectBook(id: string) {
    setBookId(id);
    setTopicId('');
    setDetail(null);
    setTopicsError(null);
  }

  async function handleExplain() {
    if (!topicId) return;
    setExplaining(true);
    setExplainError(false);
    try {
      const res = await fetch(`/api/study/${topicId}/explain`, { method: 'POST' });
      if (!res.ok) {
        setExplainError(true);
        return;
      }
      const json = await res.json();
      setDetail((prev) => (prev ? { ...prev, explanation: json.explanation } : prev));
    } catch (err) {
      console.error(err);
      setExplainError(true);
    } finally {
      setExplaining(false);
    }
  }

  async function requestPractice() {
    if (!topicId) return;
    setPracticeLoading(true);
    setPracticeError(null);
    try {
      const res = await fetch(`/api/study/${topicId}/practice`, { method: 'POST' });
      if (!res.ok) {
        setPracticeError('연습문제를 만들지 못했어요. 다시 시도해주세요.');
        return;
      }
      const question = (await res.json()) as PracticeQuestion;
      setPracticeQuestion(question);
      setPracticeFeedback(undefined);
    } finally {
      setPracticeLoading(false);
    }
  }

  async function submitPractice(questionId: string, answer: string) {
    setPracticeSubmitting(true);
    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswer: answer }),
      });
      const result = await res.json();
      setPracticeFeedback(
        result.isCorrect ? 'correct' : { explanation: result.explanation, sourcePage: result.sourcePage }
      );
    } finally {
      setPracticeSubmitting(false);
    }
  }

  const groups = groupTopics(topics);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ‹ 홈
      </Link>
      <h1 className={styles.title}>학습하기</h1>

      {booksError && <p className={styles.error}>{booksError}</p>}
      <div className={styles.bookRow}>
        {books.map((b) => (
          <button
            key={b.id}
            className={b.id === bookId ? `${styles.bookButton} ${styles.bookButtonActive}` : styles.bookButton}
            onClick={() => selectBook(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>

      {bookId && (
        <div className={styles.topicSection}>
          <label className={styles.label} htmlFor="study-topic-select">
            주제 선택
          </label>
          {topicsError && <p className={styles.error}>{topicsError}</p>}
          {!topicsError && topics.length === 0 && (
            <p className={styles.hint}>아직 학습 콘텐츠가 준비되지 않았어요.</p>
          )}
          {topics.length > 0 && (
            <select
              id="study-topic-select"
              className={styles.select}
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">주제를 선택하세요</option>
              {groups.map((group) => (
                <optgroup key={group.parent.id} label={group.parent.name}>
                  {group.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      )}

      {detailLoading && <p className={styles.hint}>불러오는 중...</p>}
      {detailError && <p className={styles.error}>{detailError}</p>}

      {detail && (
        <div className={styles.contentCard}>
          <p className={styles.contentTitle}>{detail.topic.name}</p>
          <p className={`${styles.contentText}${containsChinese(detail.content) ? ' zh' : ''}`}>
            {detail.content}
          </p>

          {detail.explanation ? (
            <p className={styles.explanation}>{detail.explanation}</p>
          ) : (
            <button className={styles.explainButton} onClick={handleExplain} disabled={explaining}>
              {explaining ? '불러오는 중...' : '해설 보기'}
            </button>
          )}
          {explainError && <p className={styles.error}>해설을 불러오지 못했어요</p>}

          <button className={styles.practiceButton} onClick={requestPractice} disabled={practiceLoading}>
            {practiceQuestion ? '다른 문제 더 풀기' : '연습문제 풀기'}
          </button>
          {practiceLoading && <p className={styles.hint}>문제 만드는 중...</p>}
          {practiceError && <p className={styles.error}>{practiceError}</p>}

          {practiceQuestion && (
            <QuizQuestion
              question={{
                id: practiceQuestion.id,
                book_id: bookId,
                type: practiceQuestion.type,
                prompt: practiceQuestion.prompt,
                choices: practiceQuestion.choices,
                source_page: practiceQuestion.sourcePage,
              }}
              index={1}
              feedback={practiceFeedback}
              onSubmit={submitPractice}
              submitting={practiceSubmitting}
              lockAfterAnswer
            />
          )}
        </div>
      )}
    </main>
  );
}
