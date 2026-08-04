import { describe, it, expect, vi } from 'vitest';
import { gradeEssay } from './gradeEssay';

describe('gradeEssay', () => {
  it('parses contentScore/chineseScore/feedback from the JSON response', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ contentScore: 80, chineseScore: 60, feedback: '문법 오류 있음' }),
            },
          ],
        }),
      },
    } as any;

    const result = await gradeEssay(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '루쉰의 광인일기...' }],
      questionPrompt: '루쉰 문학의 특징을 서술하시오',
      koreanDraft: '루쉰은 사실주의 기법으로...',
      chineseAnswer: '鲁迅用现实主义手法...',
    });

    expect(result).toEqual({ contentScore: 80, chineseScore: 60, feedback: '문법 오류 있음' });
  });

  it('includes both the Korean draft and Chinese answer in the prompt sent to Claude', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"contentScore":0,"chineseScore":0,"feedback":""}' }],
        }),
      },
    } as any;

    await gradeEssay(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '내용' }],
      questionPrompt: '질문',
      koreanDraft: '한국어 초안 내용',
      chineseAnswer: '中文答案内容',
    });

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content;
    expect(sentPrompt).toContain('한국어 초안 내용');
    expect(sentPrompt).toContain('中文答案内容');
  });
});
