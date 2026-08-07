import type Anthropic from '@anthropic-ai/sdk';
import { askClaude, parseJsonResponse } from './client';
import type { GeneratedQuestion } from './generateQuestions';

export interface ValidateQuestionInput {
  pageContent: string;
  question: GeneratedQuestion;
}

export interface QuestionValidation {
  valid: boolean;
  reason: string;
}

export async function validateQuestion(
  client: Anthropic,
  input: ValidateQuestionInput
): Promise<QuestionValidation> {
  const choicesText = input.question.choices?.length
    ? `\n선택지: ${input.question.choices.join(' / ')}\n정답: ${input.question.correctAnswer}`
    : '';

  const prompt =
    `아래는 교재 발췌와, 그 발췌만을 근거로 AI가 만든 문제입니다. 이 문제가 발췌의 실질적인 학습 내용을 ` +
    `근거로 한 타당한 문제인지 검수하세요.\n\n` +
    `다음 경우는 무효(valid: false)로 판단하세요: 목차/표지/판권 정보처럼 실질적 내용이 없는 발췌를 근거로 ` +
    `만들어졌거나 그 구성·형식 자체를 묻는 문제, 발췌 내용과 무관하거나 발췌만으로는 답을 알 수 없는 문제, ` +
    `정답이 불명확하거나 선택지 중 정답이 여러 개이거나 없는 문제, 오탈자나 비문이 있어 무슨 뜻인지 알기 ` +
    `어려운 문제.\n\n` +
    `교재 발췌:\n${input.pageContent}\n\n` +
    `문제: ${input.question.prompt}${choicesText}\n\n` +
    `다음 JSON 형식으로만 응답하세요: {"valid":true 또는 false,"reason":"판단 이유 한 문장"}`;

  const raw = await askClaude(client, prompt, {
    system: '당신은 임용고시 중국어 문제의 품질을 검수하는 엄격한 검수위원입니다.',
    maxTokens: 256,
  });

  return parseJsonResponse<QuestionValidation>(raw);
}
