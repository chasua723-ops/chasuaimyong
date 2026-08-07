import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EssayQuestion from './EssayQuestion';
import type { Question } from './types';

const question: Question = {
  id: 'q2',
  book_id: 'b1',
  type: 'essay',
  prompt: '주제와 평언의 관계를 논술하시오',
  choices: null,
  source_page: 30,
};

describe('EssayQuestion', () => {
  it('renders a badge and both step labels', () => {
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={undefined}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('서술형')).toBeInTheDocument();
    expect(screen.getByText(/1단계/)).toBeInTheDocument();
    expect(screen.getByText(/2단계/)).toBeInTheDocument();
  });

  it('calls the change handlers separately for the Korean and Chinese textareas', async () => {
    const onKoreanChange = vi.fn();
    const onChineseChange = vi.fn();
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={undefined}
        onKoreanChange={onKoreanChange}
        onChineseChange={onChineseChange}
        onSubmit={vi.fn()}
      />
    );

    const koreanBox = screen.getByLabelText(/1단계/);
    const chineseBox = screen.getByLabelText(/2단계/);
    const user = userEvent.setup();
    await user.type(koreanBox, '한');
    await user.type(chineseBox, '中');

    expect(onKoreanChange).toHaveBeenCalledWith('한');
    expect(onChineseChange).toHaveBeenCalledWith('中');
  });

  it('calls onSubmit when the submit button is clicked', async () => {
    const onSubmit = vi.fn();
    render(
      <EssayQuestion
        question={question}
        koreanDraft="초안"
        chineseAnswer="答案"
        feedback={undefined}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('제출'));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('shows the concept checklist and total score when feedback is present', () => {
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={{
          conceptScore: 3,
          conceptChecklist: [
            { concept: '주제 설명', covered: true },
            { concept: '평언 설명', covered: false },
            { concept: '관계 설명', covered: true },
            { concept: '예시 제시', covered: true },
          ],
          grammarCorrections: [],
        }}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('3/4점')).toBeInTheDocument();
    expect(screen.getByText(/주제 설명/)).toBeInTheDocument();
    expect(screen.getByText(/평언 설명/)).toBeInTheDocument();
  });

  it('shows grammar corrections with the original, corrected sentence, and explanation', () => {
    render(
      <EssayQuestion
        question={question}
        koreanDraft=""
        chineseAnswer=""
        feedback={{
          conceptScore: 4,
          conceptChecklist: [
            { concept: 'A', covered: true },
            { concept: 'B', covered: true },
            { concept: 'C', covered: true },
            { concept: 'D', covered: true },
          ],
          grammarCorrections: [
            {
              original: '我很高兴认识你们大家',
              corrected: '我很高兴认识大家',
              explanation: '你们과 大家를 같이 쓰지 않아요',
            },
          ],
        }}
        onKoreanChange={vi.fn()}
        onChineseChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('我很高兴认识你们大家')).toBeInTheDocument();
    expect(screen.getByText('我很高兴认识大家')).toBeInTheDocument();
    expect(screen.getByText(/你们과 大家를 같이 쓰지 않아요/)).toBeInTheDocument();
  });
});
