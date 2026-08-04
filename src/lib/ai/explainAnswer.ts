import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface ExplainInput {
  bookName: string;
  sourcePage: number;
  pageContent: string;
  questionPrompt: string;
  correctAnswer: string;
  userAnswer: string;
}

export async function explainAnswer(client: Anthropic, input: ExplainInput): Promise<string> {
  const prompt =
    `"${input.bookName}" ${input.sourcePage}페이지 내용을 근거로, 아래 문제에서 사용자가 왜 ` +
    `틀렸는지 한국어로 설명해주세요.\n\n` +
    `교재 내용: ${input.pageContent}\n` +
    `문제: ${input.questionPrompt}\n` +
    `정답: ${input.correctAnswer}\n` +
    `사용자 답: ${input.userAnswer}\n\n` +
    `설명은 3문장 이내로, 반드시 위 교재 내용에 근거해서 작성하세요.`;

  return askClaude(client, prompt, {
    system: '당신은 중등 임용고시 중국어 과목 튜터입니다.',
    maxTokens: 300,
  });
}
