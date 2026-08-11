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

  it('instructs the essay prompt to be written in Chinese when essay is among the requested types', async () => {
    const client = fakeClientReturning('[]');

    await generateQuestions(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '내용' }],
      types: ['essay'],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('중국어로 출제');
  });

  it('sometimes instructs the objective-question prompt itself to be written in Chinese', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1); // < CHINESE_PROMPT_PROBABILITY
    const client = fakeClientReturning('[]');

    await generateQuestions(client, {
      bookName: '전공중국어 문법',
      pages: [{ pageNum: 12, content: '把자문 설명' }],
      types: ['grammar'],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('prompt(질문 문장) 자체를 중국어로');
    randomSpy.mockRestore();
  });

  it('does not force a Chinese prompt on every objective question (or on essay-only requests)', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9); // > CHINESE_PROMPT_PROBABILITY
    const client = fakeClientReturning('[]');

    await generateQuestions(client, {
      bookName: '전공중국어 문법',
      pages: [{ pageNum: 12, content: '把자문 설명' }],
      types: ['grammar'],
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).not.toContain('prompt(질문 문장) 자체를 중국어로');
    randomSpy.mockRestore();
  });

  it('instructs Claude to decline table-of-contents/cover/colophon pages instead of quizzing on their structure', async () => {
    // Reproduces a real failure: a random page landed on the table of contents, and Claude
    // dutifully generated a "valid" JSON question asking about the ToC's own structure/layout
    // instead of declining — a technically well-formed but useless question.
    const client = fakeClientReturning('[]');

    await generateQuestions(client, {
      bookName: '전공중국어 문법',
      pages: [{ pageNum: 2, content: '목차\n1장 ... 3\n2장 ... 15' }],
      types: ['grammar'],
    });

    const sentSystem = client.messages.create.mock.calls[0][0].system;
    expect(sentSystem).toContain('목차');
  });
});
