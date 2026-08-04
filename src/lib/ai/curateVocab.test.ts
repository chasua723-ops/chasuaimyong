import { describe, it, expect, vi } from 'vitest';
import { curateVocab } from './curateVocab';

describe('curateVocab', () => {
  it('parses a single vocab item from the JSON response', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                wordZh: '内卷',
                pinyin: 'nèijuǎn',
                meaningKo: '내권 (과도한 경쟁)',
                exampleZh: '现在竞争太内卷了。',
                exampleKo: '요즘 경쟁이 너무 내권화되었다.',
              }),
            },
          ],
        }),
      },
    } as any;

    const result = await curateVocab(client, []);

    expect(result.wordZh).toBe('内卷');
    expect(result.pinyin).toBe('nèijuǎn');
  });

  it('includes previously used words in the exclusion list sent to Claude', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '{"wordZh":"x","pinyin":"x","meaningKo":"x","exampleZh":"x","exampleKo":"x"}',
            },
          ],
        }),
      },
    } as any;

    await curateVocab(client, ['内卷', '躺平']);

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('内卷');
    expect(sentPrompt).toContain('躺平');
  });
});
