import { describe, it, expect, vi } from 'vitest';
import { askClaude } from './client';

describe('askClaude', () => {
  it('returns the text content from the response', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello from claude' }],
        }),
      },
    } as any;

    const result = await askClaude(fakeClient, 'say hello');

    expect(result).toBe('hello from claude');
    expect(fakeClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: 'say hello' }] })
    );
  });

  it('throws when the response contains no text block', async () => {
    const fakeClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    } as any;

    await expect(askClaude(fakeClient, 'say hello')).rejects.toThrow('no text block');
  });
});
