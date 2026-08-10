'use client';

import { useEffect, useState } from 'react';
import styles from './SessionTimer.module.css';

const TARGET_MS = 15 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface SessionTimerProps {
  startedAt: number;
}

export default function SessionTimer({ startedAt }: SessionTimerProps) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const overTarget = elapsedMs > TARGET_MS;

  return (
    <div className={`${styles.timer} ${overTarget ? styles.over : ''}`}>
      {formatElapsed(elapsedMs)} / {formatElapsed(TARGET_MS)}
    </div>
  );
}
