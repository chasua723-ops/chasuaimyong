import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, parseJsonResponse } from './client';

export interface EssayGradeInput {
  bookName: string;
  pages: { pageNum: number; content: string }[];
  questionPrompt: string;
  koreanDraft: string;
  chineseAnswer: string;
}

export interface ConceptCheck {
  concept: string;
  covered: boolean;
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

export interface EssayGradeResult {
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
}

interface RawEssayGrade {
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
}

export async function gradeEssay(client: Anthropic, input: EssayGradeInput): Promise<EssayGradeResult> {
  const pageText = input.pages.map((p) => `[p.${p.pageNum}] ${p.content}`).join('\n\n');

  const prompt =
    `아래는 "${input.bookName}" 교재 발췌와 서술형 문제, 사용자의 2단계 답안입니다.\n` +
    `문제: ${input.questionPrompt}\n\n` +
    `1단계(한국어 내용 정리): ${input.koreanDraft}\n` +
    `2단계(중국어 답안): ${input.chineseAnswer}\n\n` +
    `교재 발췌:\n${pageText}\n\n` +
    `먼저 교재 발췌 내용을 근거로, 이 문제에 대한 완전한 답안이 반드시 포함해야 할 핵심 개념 4개를 뽑으세요. ` +
    `그다음 사용자의 중국어 답안(2단계)이 각 개념을 담고 있는지 하나씩 판단하세요. ` +
    `마지막으로, 중국어 답안의 문법/표현상 어색하거나 틀린 문장을 찾아 자연스럽게 고친 버전과 짧은 한국어 ` +
    `설명을 제시하세요 (문제 없으면 빈 배열).\n\n` +
    `다음 JSON 형식으로만 응답하세요: ` +
    `{"conceptChecklist":[{"concept":"...","covered":true},{"concept":"...","covered":false},` +
    `{"concept":"...","covered":true},{"concept":"...","covered":true}],` +
    `"grammarCorrections":[{"original":"...","corrected":"...","explanation":"..."}]}`;

  const raw = await askClaude(client, prompt, {
    system:
      '당신은 중등 임용고시 중국어 서술형 채점관입니다. 반드시 주어진 교재 내용에 근거해 채점하세요. ' +
      '실제 임용고시처럼 개념 커버리지로 채점하고, 문법 오류는 점수에 반영하지 말고 별도로 교정문을 ' +
      '제시하세요. 중국어 예문이나 표현을 인용할 때는 반드시 간체자(简体字)로만 작성하세요. ' +
      '번체자(繁體字)는 절대 사용하지 마세요.',
    maxTokens: 1024,
  });

  const parsed = parseJsonResponse<RawEssayGrade>(raw);
  const conceptScore = parsed.conceptChecklist.filter((c) => c.covered).length;

  return {
    conceptScore,
    conceptChecklist: parsed.conceptChecklist,
    grammarCorrections: parsed.grammarCorrections,
  };
}
