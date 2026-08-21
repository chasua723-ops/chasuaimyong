import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface ExplainTopicInput {
  bookName: string;
  topicName: string;
  content: string;
}

export async function explainTopic(client: Anthropic, input: ExplainTopicInput): Promise<string> {
  const prompt =
    `다음은 "${input.bookName}" 교재의 "${input.topicName}" 부분 원문입니다:\n\n${input.content}\n\n` +
    `위 교재 내용에만 근거해서, "${input.topicName}"을 학생이 실제로 이해하고 암기할 수 있도록 ` +
    `설명해주세요. 핵심 개념이나 용어의 이름만 나열하고 넘어가지 말고, 각각이 실제로 무슨 내용인지 ` +
    `(정의, 하위 유형, 예시 등 교재에 있는 구체적 내용)를 빠짐없이 설명하세요. 다룰 내용이 많으면 ` +
    `그만큼 길게 써도 좋으니, 분량을 줄이는 것보다 각 개념의 실제 내용을 빠짐없이 전달하는 것을 ` +
    `최우선으로 하세요.`;

  return askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 과목 튜터입니다. 반드시 주어진 교재 내용에만 근거해 설명하세요. ' +
      '교재에 없는 내용을 임의로 추가하지 마세요. 개념의 이름만 언급하고 넘어가지 말고, 그 개념이 ' +
      '실제로 무엇을 의미하는지 교재에 있는 구체적 내용으로 설명하세요. 중국어 표현을 인용할 때는 ' +
      '반드시 간체자(简体字)로만 작성하세요. 번체자(繁體字)는 절대 사용하지 마세요. 마크다운 문법 ' +
      '(#, **, -, 번호 매기기 등)을 사용하지 말고 일반 문장으로만 답하세요.',
    maxTokens: 2000,
  });
}
