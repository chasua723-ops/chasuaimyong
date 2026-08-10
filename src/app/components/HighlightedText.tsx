import type { ReactNode } from 'react';
import styles from './HighlightedText.module.css';

/**
 * Question prompts sometimes reference a specific span within the text (e.g. "다음 밑줄 친
 * 부분이 옳은 것은?"). Since prompts render as plain text, generateQuestions instructs the AI
 * to wrap that span in [[ ]] so it can be colored here instead of relying on an actual
 * underline, which plain text can't render.
 */
function parseHighlightedText(text: string): ReactNode[] {
  const parts = text.split(/(\[\[.+?\]\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[\[(.+)\]\]$/);
    return match ? (
      <span key={i} className={styles.highlight}>
        {match[1]}
      </span>
    ) : (
      part
    );
  });
}

interface HighlightedTextProps {
  text: string;
}

export default function HighlightedText({ text }: HighlightedTextProps) {
  return <>{parseHighlightedText(text)}</>;
}
