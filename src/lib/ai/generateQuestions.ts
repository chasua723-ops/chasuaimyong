import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, parseJsonResponse } from './client';
import type { QuestionType } from '@/types/db';

export interface QuestionGenInput {
  bookName: string;
  pages: { pageNum: number; content: string }[];
  types: QuestionType[];
  referenceExcerpts?: string[];
}

export interface GeneratedQuestion {
  type: QuestionType;
  sourcePage: number;
  prompt: string;
  choices?: string[];
  correctAnswer: string;
}

export async function generateQuestions(
  client: Anthropic,
  input: QuestionGenInput
): Promise<GeneratedQuestion[]> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');
  const referenceText = input.referenceExcerpts?.length
    ? `\n\n실제 기출문제 스타일 참고:\n${input.referenceExcerpts.join('\n---\n')}`
    : '';

  const prompt =
    `다음은 "${input.bookName}" 교재의 일부 발췌입니다. 이 내용만을 근거로 ` +
    `${input.types.join(', ')} 유형의 문제를 각 1개씩 만들어주세요. ` +
    `각 문제는 반드시 아래 JSON 배열 형식으로만 응답하세요:\n` +
    `[{"type":"grammar","sourcePage":12,"prompt":"...","choices":["...","..."],"correctAnswer":"..."}]\n\n` +
    `교재 발췌:\n${pageText}${referenceText}`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 출제 위원입니다. 반드시 주어진 교재 내용에만 근거해 문제를 냅니다.',
    maxTokens: 2048,
  });

  return parseJsonResponse<GeneratedQuestion[]>(raw);
}
