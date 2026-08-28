import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface SearchExcerpt {
  bookName: string;
  pageNum: number;
  content: string;
}

export interface SearchHistoryTurn {
  question: string;
  answer: string;
}

export interface AnswerSearchQueryInput {
  query: string;
  excerpts: SearchExcerpt[];
  history?: SearchHistoryTurn[];
}

export async function answerSearchQuery(
  client: Anthropic,
  input: AnswerSearchQueryInput
): Promise<string> {
  const excerptsText = input.excerpts
    .map((e) => `[${e.bookName} ${e.pageNum}페이지] ${e.content}`)
    .join('\n\n');

  const historyText = (input.history ?? [])
    .map((h) => `이전 질문: ${h.question}\n이전 답변: ${h.answer}`)
    .join('\n\n');

  const prompt =
    (historyText ? `지금까지의 대화:\n${historyText}\n\n` : '') +
    `아래는 검색어 "${input.query}"와 관련해 교재에서 찾은 발췌문입니다:\n\n${excerptsText}\n\n` +
    `위 발췌문 내용에만 근거해서 "${input.query}"에 대해 학생이 실제로 이해할 수 있도록 답변해주세요. ` +
    `핵심 개념이나 용어의 이름만 나열하고 넘어가지 말고, 각각이 실제로 무슨 내용인지(정의, 하위 유형, ` +
    `예시 등 교재에 있는 구체적 내용)를 빠짐없이 설명하세요. 다룰 내용이 많으면 그만큼 길게 써도 좋으니, ` +
    `분량을 줄이는 것보다 각 개념의 실제 내용을 빠짐없이 전달하는 것을 최우선으로 하세요.`;

  return askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 튜터입니다. 반드시 주어진 발췌문 내용에만 근거해 답변하세요. ' +
      '발췌문에 없는 내용을 임의로 추가하지 마세요. 개념의 이름만 언급하고 넘어가지 말고, 그 개념이 ' +
      '실제로 무엇을 의미하는지 발췌문에 있는 구체적 내용으로 설명하세요. 중국어 표현을 인용할 때는 ' +
      '반드시 간체자(简体字)로만 작성하세요. 번체자(繁體字)는 절대 사용하지 마세요. 마크다운 문법 ' +
      '(#, **, -, 번호 매기기 등)을 사용하지 말고 일반 문장으로만 답하세요.',
    maxTokens: 2000,
  });
}
