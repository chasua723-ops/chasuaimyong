import { describe, it, expect, vi } from 'vitest';
import { parseTocWithAI } from './parseTocWithAI';

describe('parseTocWithAI', () => {
  it('parses the AI JSON response into a 2-level chapter tree, and includes the book name and TOC text in the prompt', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                { name: '1장 품사론', startPage: 1, children: [{ name: '1절 수사', startPage: 3 }] },
              ]),
            },
          ],
        }),
      },
    } as any;

    const result = await parseTocWithAI(client, {
      bookName: '전공중국어 문법',
      tocText: '1장 품사론 ...... 1\n  1절 수사 ...... 3',
    });

    expect(result).toEqual([
      { name: '1장 품사론', startPage: 1, children: [{ name: '1절 수사', startPage: 3 }] },
    ]);
    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('전공중국어 문법');
    expect(sentPrompt).toContain('1장 품사론 ...... 1');
  });

  it('strips a markdown code fence if Claude wraps the JSON in one', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '```json\n' + JSON.stringify([{ name: '1장', startPage: 1, children: [] }]) + '\n```',
            },
          ],
        }),
      },
    } as any;

    const result = await parseTocWithAI(client, { bookName: '책', tocText: '목차' });

    expect(result).toEqual([{ name: '1장', startPage: 1, children: [] }]);
  });
});
