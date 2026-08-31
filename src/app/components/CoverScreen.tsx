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
      <nav className={styles.navList}>
        <button className={`${styles.navLink} ${styles.navLinkStart}`} onClick={onStart}>
          오늘의 학습 시작하기 <span className={styles.navLinkArrow} aria-hidden="true">›</span>
        </button>
        <Link href="/notebook" className={`${styles.navLink} ${styles.navLinkNotebook}`}>
          오답노트 <span className={styles.navLinkArrow} aria-hidden="true">›</span>
        </Link>
        <Link href="/essay-notes" className={`${styles.navLink} ${styles.navLinkEssayNotes}`}>
          서술형 노트 <span className={styles.navLinkArrow} aria-hidden="true">›</span>
        </Link>
        <Link href="/quiz-practice" className={`${styles.navLink} ${styles.navLinkQuizPractice}`}>
          더 풀기 <span className={styles.navLinkArrow} aria-hidden="true">›</span>
        </Link>
        <Link href="/study" className={`${styles.navLink} ${styles.navLinkStudy}`}>
          학습하기 <span className={styles.navLinkArrow} aria-hidden="true">›</span>
        </Link>
        <Link href="/search" className={`${styles.navLink} ${styles.navLinkSearch}`}>
          검색 <span className={styles.navLinkArrow} aria-hidden="true">›</span>
        </Link>
      </nav>
    </div>
  );
}
