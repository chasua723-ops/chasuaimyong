import { describe, it, expect, vi } from 'vitest';
import { generateQuestions } from './generateQuestions';

function fakeClientReturning(text: string) {
  return {
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) },
  } as any;
}

describe('generateQuestions', () => {
  it('parses the JSON question array returned by Claude', async () => {
    const questions = [
      { type: 'grammar', sourcePage: 12, prompt: '다음 문장의 오류를 찾으시오', correctAnswer: 'B' },
    ];
    const client = fakeClientReturning(JSON.stringify(questions));

    const result = await generateQuestions(client, {
      bookName: '전공중국어 문법',
      pages: [{ pageNum: 12, content: '把자문 설명' }],
      types: ['grammar'],
    });

    expect(result).toEqual(questions);
  });

  it('embeds page markers and reference excerpts in the prompt sent to Claude', async () => {
    const client = fakeClientReturning('[]');

    await generateQuestions(client, {
      bookName: '전공중국어 문법',
      pages: [{ pageNum: 5, content: '내용' }],
      types: ['reading'],
      referenceExcerpts: ['기출 예시 문제'],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('[p.5]');
    expect(sentPrompt).toContain('기출 예시 문제');
  });
});
