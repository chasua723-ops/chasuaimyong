import { describe, it, expect, vi } from 'vitest';
import { gradeEssay } from './gradeEssay';

describe('gradeEssay', () => {
  it('computes conceptScore as the count of covered concepts', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                conceptChecklist: [
                  { concept: '루쉰의 사실주의 기법', covered: true },
                  { concept: '광인일기의 상징', covered: false },
                  { concept: '봉건 사회 비판', covered: true },
                  { concept: '백화문 사용', covered: true },
                ],
                grammarCorrections: [],
              }),
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

    expect(result.conceptScore).toBe(3);
    expect(result.conceptChecklist).toHaveLength(4);
    expect(result.grammarCorrections).toEqual([]);
  });

  it('includes grammar corrections with original, corrected, and explanation', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                conceptChecklist: [
                  { concept: 'A', covered: true },
                  { concept: 'B', covered: true },
                  { concept: 'C', covered: true },
                  { concept: 'D', covered: true },
                ],
                grammarCorrections: [
                  {
                    original: '我很高兴认识你们大家',
                    corrected: '我很高兴认识大家',
                    explanation: '你们과 大家를 같이 쓰지 않아요',
                  },
                ],
              }),
            },
          ],
        }),
      },
    } as any;

    const result = await gradeEssay(client, {
      bookName: '전공중국어 문학개론',
      pages: [{ pageNum: 30, content: '내용' }],
      questionPrompt: '질문',
      koreanDraft: '초안',
      chineseAnswer: '我很高兴认识你们大家',
    });

    expect(result.grammarCorrections).toEqual([
      {
        original: '我很高兴认识你们大家',
        corrected: '我很高兴认识大家',
        explanation: '你们과 大家를 같이 쓰지 않아요',
      },
    ]);
  });

  it('includes both the Korean draft and Chinese answer in the prompt sent to Claude', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text:
                '{"conceptChecklist":[{"concept":"A","covered":false},{"concept":"B","covered":false},' +
                '{"concept":"C","covered":false},{"concept":"D","covered":false}],"grammarCorrections":[]}',
            },
          ],
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
