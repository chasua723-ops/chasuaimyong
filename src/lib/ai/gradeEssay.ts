import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, parseJsonResponse } from './client';

export interface EssayGradeInput {
  bookName: string;
  pages: { pageNum: number; content: string }[];
  questionPrompt: string;
  koreanDraft: string;
  chineseAnswer: string;
}

export interface EssayGradeResult {
  contentScore: number;
  chineseScore: number;
  feedback: string;
}

export async function gradeEssay(client: Anthropic, input: EssayGradeInput): Promise<EssayGradeResult> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');

  const prompt =
    `아래는 "${input.bookName}" 교재 발췌와 서술형 문제, 사용자의 2단계 답안입니다.\n` +
    `문제: ${input.questionPrompt}\n\n` +
    `1단계(한국어 내용 정리): ${input.koreanDraft}\n` +
    `2단계(중국어 답안): ${input.chineseAnswer}\n\n` +
    `교재 발췌:\n${pageText}\n\n` +
    `다음 JSON 형식으로만 응답하세요: ` +
    `{"contentScore": 0-100 정수, "chineseScore": 0-100 정수, "feedback": "교재 근거를 포함한 한국어 피드백"}\n` +
    `contentScore는 교재 내용과 비교한 정확도, chineseScore는 중국어 표현의 정확성과 자연스러움을 평가하세요.`;

  const raw = await askClaude(client, prompt, {
    system: '당신은 중등 임용고시 중국어 서술형 채점관입니다. 반드시 주어진 교재 내용에 근거해 채점하세요.',
    maxTokens: 1024,
  });

  return parseJsonResponse<EssayGradeResult>(raw);
}
