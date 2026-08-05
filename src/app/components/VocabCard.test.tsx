import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VocabCard from './VocabCard';

describe('VocabCard', () => {
  it('renders the vocab word and labels it as AI-curated', () => {
    render(<VocabCard vocab={{ word_zh: '内卷', pinyin: 'nèi juǎn', meaning_ko: '내부 경쟁 심화' }} />);

    expect(screen.getByText('内卷')).toBeInTheDocument();
    expect(screen.getByText(/nèi juǎn/)).toBeInTheDocument();
    expect(screen.getByText(/내부 경쟁 심화/)).toBeInTheDocument();
    expect(screen.getByText('AI 큐레이션')).toBeInTheDocument();
  });
});
