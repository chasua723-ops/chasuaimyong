'use client';

import Link from 'next/link';
import type { BookRange } from './types';
import styles from './session.module.css';

interface CoverScreenProps {
  bookRanges: BookRange[];
  onStart: () => void;
}

function formatToday(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

export default function CoverScreen({ bookRanges, onStart }: CoverScreenProps) {
  return (
    <div className={styles.cover}>
      <div className={styles.coverDate}>{formatToday()}</div>
      <h1 className={styles.coverTitle}>오늘의 학습</h1>
      <div className={styles.coverRanges}>
        {bookRanges.map((r) => (
          <div key={r.bookId} className={styles.coverRangeItem}>
            {r.name} · {r.startPage}~{r.endPage}p
          </div>
        ))}
      </div>
      <button className={styles.startButton} onClick={onStart}>
        오늘의 학습 시작하기 →
      </button>
      <Link href="/notebook" className={styles.notebookTab}>
        오답노트
      </Link>
      <Link href="/essay-notes" className={styles.essayNotesTab}>
        서술형 노트
      </Link>
    </div>
  );
}
