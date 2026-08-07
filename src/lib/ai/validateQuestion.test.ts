import { describe, it, expect, vi } from 'vitest';
import { validateQuestion } from './validateQuestion';

function fakeClientReturning(text: string) {
  return {
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) },
  } as any;
}

describe('validateQuestion', () => {
  it('returns valid: true when Claude judges the question sound', async () => {
    const client = fakeClientReturning('{"valid":true,"reason":"발췌 내용에 근거한 타당한 문제입니다."}');

    const result = await validateQuestion(client, {
      pageContent: '把자문은 处置 의미를 나타내는 구문이다...',
      question: {
        type: 'grammar',
        sourcePage: 12,
        prompt: '把자문의 용법으로 옳은 것은?',
        choices: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
      },
    });

    expect(result.valid).toBe(true);
  });

  it('returns valid: false with a reason when the question is about ToC structure rather than content', async () => {
    const client = fakeClientReturning(
      '{"valid":false,"reason":"목차의 구성 형식을 묻는 문제로, 실제 학습 내용에 근거하지 않았습니다."}'
    );

    const result = await validateQuestion(client, {
      pageContent: '목차\n1장 ... 3\n2장 ... 15',
      question: {
        type: 'grammar',
        sourcePage: 2,
        prompt: '다음 중 이 책의 목차 구성 방식으로 옳은 것은?',
        choices: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('목차');
  });

  it('sends the page content and the question to Claude for review', async () => {
    const client = fakeClientReturning('{"valid":true,"reason":"ok"}');

    await validateQuestion(client, {
      pageContent: '内容in the page',
      question: {
        type: 'vocab',
        sourcePage: 5,
        prompt: '다음 단어의 뜻은?',
        choices: ['뜻1', '뜻2'],
        correctAnswer: '뜻1',
      },
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('内容in the page');
    expect(sentPrompt).toContain('다음 단어의 뜻은?');
  });
});
