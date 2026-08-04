import { describe, it, expect, vi } from 'vitest';
import { askClaude, parseJsonResponse } from './client';

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

describe('parseJsonResponse', () => {
  it('parses plain JSON with no fence', () => {
    expect(parseJsonResponse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a ```json fence', () => {
    const raw = '```json\n{"a":1,"b":[2,3]}\n```';
    expect(parseJsonResponse<{ a: number; b: number[] }>(raw)).toEqual({ a: 1, b: [2, 3] });
  });

  it('parses JSON wrapped in a bare ``` fence', () => {
    const raw = '```\n[{"type":"grammar"}]\n```';
    expect(parseJsonResponse<{ type: string }[]>(raw)).toEqual([{ type: 'grammar' }]);
  });

  it('throws a clear error including a snippet when the response is not JSON', () => {
    expect(() => parseJsonResponse('죄송합니다, 문제를 만들 수 없습니다.')).toThrow(
      /Failed to parse JSON from Claude response: 죄송합니다/
    );
  });
});
