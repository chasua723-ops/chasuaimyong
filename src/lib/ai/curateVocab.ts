import type Anthropic from '@anthropic-ai/sdk';
import { askClaude } from './client';

export interface VocabItem {
  wordZh: string;
  pinyin: string;
  meaningKo: string;
  exampleZh: string;
  exampleKo: string;
}

export async function curateVocab(client: Anthropic, excludeWords: string[]): Promise<VocabItem> {
  const prompt =
    `중등 임용고시 중국어 과목 독해 지문에 나올 법한, 최근 출제 경향의 트렌드 중국어 어휘를 ` +
    `1개 추천해주세요. 이미 낸 단어는 제외: ${excludeWords.join(', ') || '없음'}\n` +
    `다음 JSON 형식으로만 응답하세요: ` +
    `{"wordZh":"...","pinyin":"...","meaningKo":"...","exampleZh":"...","exampleKo":"..."}`;

  const raw = await askClaude(client, prompt, {
    system: '당신은 중국어 임용고시 출제 경향에 정통한 어휘 큐레이터입니다.',
    maxTokens: 512,
  });

  return JSON.parse(raw) as VocabItem;
}
