import type { Vocab } from './types';
import styles from './session.module.css';

export default function VocabCard({ vocab }: { vocab: Vocab }) {
  return (
    <section className={styles.vocabCard}>
      <div className={styles.vocabHeader}>
        <strong>오늘의 어휘</strong>
        <span className={styles.vocabBadge}>AI 큐레이션</span>
      </div>
      <p className={styles.vocabWord}>
        <strong className="zh">{vocab.word_zh}</strong> ({vocab.pinyin}) — {vocab.meaning_ko}
      </p>
    </section>
  );
}
