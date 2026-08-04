import { describe, it, expect, vi } from 'vitest';
import { explainAnswer } from './explainAnswer';

describe('explainAnswer', () => {
  it('includes the page content, correct answer, and user answer in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '설명입니다' }] }),
      },
    } as any;

    const result = await explainAnswer(client, {
      bookName: '전공중국어 문법',
      sourcePage: 12,
      pageContent: '把자문은 목적어를 동사 앞으로 이동시킨다',
      questionPrompt: '把자문의 어순은?',
      correctAnswer: '주어+把+목적어+동사',
      userAnswer: '주어+동사+목적어',
    });

    expect(result).toBe('설명입니다');
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('把자문은 목적어를 동사 앞으로 이동시킨다');
    expect(sentPrompt).toContain('주어+把+목적어+동사');
    expect(sentPrompt).toContain('주어+동사+목적어');
  });
});
