// src/app/search/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { containsChinese } from '@/lib/containsChinese';
import styles from './search.module.css';

interface SearchMatch {
  bookId: string;
  bookName: string;
  pageNum: number;
  content: string;
}

interface Turn {
  question: string;
  answer: string;
  matches: SearchMatch[];
}

export default function SearchPage() {
  const [queryInput, setQueryInput] = useState('');
  const [followupInput, setFollowupInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runQuery(query: string, history: { question: string; answer: string }[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, history: history.length > 0 ? history : undefined }),
      });
      if (!res.ok) {
        setError('검색하지 못했어요. 다시 시도해주세요.');
        return undefined;
      }
      return (await res.json()) as { answer: string; matches: SearchMatch[] };
    } catch (err) {
      console.error(err);
      setError('검색하지 못했어요. 다시 시도해주세요.');
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (loading) return;
    const query = queryInput.trim();
    if (!query) return;
    const result = await runQuery(query, []);
    if (!result) return;
    setTurns([{ question: query, answer: result.answer, matches: result.matches }]);
    setQueryInput('');
  }

  async function handleFollowup() {
    if (loading) return;
    const query = followupInput.trim();
    if (!query) return;
    const history = turns.filter((t) => t.answer).map((t) => ({ question: t.question, answer: t.answer }));
    const result = await runQuery(query, history);
    if (!result) return;
    setTurns((prev) => [...prev, { question: query, answer: result.answer, matches: result.matches }]);
    setFollowupInput('');
  }

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ‹ 홈
      </Link>
      <h1 className={styles.title}>검색</h1>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="검색어를 입력하세요"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className={styles.searchButton} onClick={handleSearch} disabled={loading}>
          검색
        </button>
      </div>

      {loading && <p className={styles.hint}>검색 중...</p>}
      {error && <p className={styles.error}>{error}</p>}

      {turns.map((turn, i) => (
        <div key={i} className={styles.turnCard}>
          <p className={styles.turnQuestion}>{turn.question}</p>
          {turn.matches.length === 0 ? (
            <p className={styles.empty}>검색 결과가 없어요.</p>
          ) : (
            <>
              <p className={styles.turnAnswer}>{turn.answer}</p>
              <div className={styles.matchList}>
                {turn.matches.map((m, j) => (
                  <div key={j} className={styles.matchItem}>
                    <p className={styles.matchMeta}>
                      {m.bookName} · {m.pageNum}페이지
                    </p>
                    <p className={`${styles.matchContent}${containsChinese(m.content) ? ' zh' : ''}`}>
                      {m.content}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}

      {turns.length > 0 && (
        <div className={styles.followupRow}>
          <input
            className={styles.searchInput}
            value={followupInput}
            onChange={(e) => setFollowupInput(e.target.value)}
            placeholder="추가로 궁금한 걸 물어보세요"
            onKeyDown={(e) => e.key === 'Enter' && handleFollowup()}
          />
          <button className={styles.searchButton} onClick={handleFollowup} disabled={loading}>
            질문
          </button>
        </div>
      )}
    </main>
  );
}
