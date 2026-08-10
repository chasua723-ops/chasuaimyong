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

const CHOICE_QUESTION_STYLES = [
  '다음 중 옳은 것을 고르시오 형식 (5개 중 맞는 것 1개)',
  '다음 중 옳지 않은 것을 고르시오 형식 (5개 중 틀린 것 1개)',
  '빈칸이나 밑줄 친 부분에 들어갈 가장 적절한 표현을 고르는 형식',
  '제시된 설명·예시·개념에 해당하는 것을 고르는 형식 (정의를 주고 맞는 용어/예시를 고르게 하거나, 반대로)',
];

function pickChoiceQuestionStyle(): string {
  return CHOICE_QUESTION_STYLES[Math.floor(Math.random() * CHOICE_QUESTION_STYLES.length)];
}

export async function generateQuestions(
  client: Anthropic,
  input: QuestionGenInput
): Promise<GeneratedQuestion[]> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');
  const referenceText = input.referenceExcerpts?.length
    ? `\n\n실제 기출문제 스타일 참고:\n${input.referenceExcerpts.join('\n---\n')}`
    : '';
  const essayInstruction = input.types.includes('essay')
    ? '\n\nessay 유형 문제의 prompt는 반드시 중국어로 출제하세요 (실제 임용고시 서술형 문제는 중국어로 제시됩니다).'
    : '';
  const hasChoiceType = input.types.some((t) => t !== 'essay');
  const styleInstruction = hasChoiceType
    ? `\n\n객관식(5지선다) 문제는 반드시 다음 형식으로 출제하세요: ${pickChoiceQuestionStyle()}. ` +
      `매번 같은 형식("옳지 않은 것을 고르시오")만 반복하지 말고, 지정된 형식을 따르세요.`
    : '';

  const prompt =
    `다음은 "${input.bookName}" 교재의 일부 발췌입니다. 이 내용만을 근거로 ` +
    `${input.types.join(', ')} 유형의 문제를 각 1개씩 만들어주세요. ` +
    `각 문제는 반드시 아래 JSON 배열 형식으로만 응답하세요:\n` +
    `[{"type":"grammar","sourcePage":12,"prompt":"...","choices":["...","..."],"correctAnswer":"..."}]\n\n` +
    `교재 발췌:\n${pageText}${referenceText}${essayInstruction}${styleInstruction}`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 출제 위원입니다. 반드시 주어진 교재 내용에만 근거해 문제를 냅니다. ' +
      '중국어 텍스트는 반드시 간체자(简体字)로만 작성하세요. 번체자(繁體字)는 절대 사용하지 마세요. ' +
      '주어진 발췌가 목차, 표지, 판권 정보, 색인처럼 실질적인 학습 개념이 없는 페이지라면, 그 목차나 ' +
      '표지의 구성·형식 자체를 묻는 문제를 억지로 만들지 마세요. 그런 경우 JSON 배열 대신, 왜 문제를 낼 ' +
      '수 없는지 한국어로 한 문장만 응답하세요.',
    maxTokens: 2048,
  });

  return parseJsonResponse<GeneratedQuestion[]>(raw);
}
