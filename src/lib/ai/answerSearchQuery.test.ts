import { describe, it, expect, vi } from 'vitest';
import { answerSearchQuery } from './answerSearchQuery';

describe('answerSearchQuery', () => {
  it('includes the query and excerpt content in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '답변입니다' }] }),
      },
    } as any;

    const result = await answerSearchQuery(client, {
      query: '把자문',
      excerpts: [{ bookName: '문법', pageNum: 10, content: '把자문은 목적어를 동사 앞으로 이동시킨다' }],
    });

    expect(result).toBe('답변입니다');
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('把자문');
    expect(sentPrompt).toContain('문법 10페이지');
    expect(sentPrompt).toContain('把자문은 목적어를 동사 앞으로 이동시킨다');
  });

  it('includes prior Q&A history in the prompt when provided', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '후속 답변' }] }),
      },
    } as any;

    await answerSearchQuery(client, {
      query: '그럼 겸어문은?',
      excerpts: [{ bookName: '문법', pageNum: 20, content: '겸어문 관련 내용' }],
      history: [{ question: '把자문이 뭐야?', answer: '把자문은 ~입니다' }],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('把자문이 뭐야?');
    expect(sentPrompt).toContain('把자문은 ~입니다');
  });
});
