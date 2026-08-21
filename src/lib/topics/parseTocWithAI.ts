import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, parseJsonResponse } from '../ai/client';
import type { ParsedChapter } from './computeTopicRanges';

export interface ParseTocInput {
  bookName: string;
  tocText: string;
}

export async function parseTocWithAI(
  client: Anthropic,
  input: ParseTocInput
): Promise<ParsedChapter[]> {
  const prompt =
    `다음은 "${input.bookName}" 교재의 목차(차례) 페이지 원문입니다:\n\n${input.tocText}\n\n` +
    `이 목차를 대분류(장)와 그 아래 소분류(절)로 구성된 2단계 트리로 정리해주세요. ` +
    `각 항목은 목차에 표시된 실제 페이지 번호(startPage)를 그대로 사용하세요. ` +
    `3단계 이상으로 세분화된 항목이 있다면, 그 하위 항목들을 별도로 만들지 말고 가장 가까운 ` +
    `소분류(절)에 합쳐서 2단계까지만 표현하세요.\n\n` +
    `아래 JSON 형식으로만 응답하세요 (다른 설명 없이):\n` +
    `[{"name": "장 이름", "startPage": 1, "children": [{"name": "절 이름", "startPage": 3}]}]`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 교재 목차를 구조화된 JSON으로 변환하는 도구입니다. 반드시 유효한 JSON만 응답하세요.',
    maxTokens: 4096,
  });

  return parseJsonResponse<ParsedChapter[]>(raw);
}
