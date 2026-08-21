import { describe, it, expect, vi } from 'vitest';
import { explainTopic } from './explainTopic';

describe('explainTopic', () => {
  it('includes the book name, topic name, and page content in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '설명입니다' }] }),
      },
    } as any;

    const result = await explainTopic(client, {
      bookName: '전공중국어 문법',
      topicName: '수사',
      content: '수사는 명사 앞에 온다',
    });

    expect(result).toBe('설명입니다');
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('전공중국어 문법');
    expect(sentPrompt).toContain('수사');
    expect(sentPrompt).toContain('수사는 명사 앞에 온다');
  });
});
