// src/app/components/types.ts
export interface Question {
  id: string;
  book_id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  source_page: number;
}

export interface Vocab {
  word_zh: string;
  pinyin: string;
  meaning_ko: string;
}

export interface BookRange {
  bookId: string;
  name: string;
  startPage: number;
  endPage: number;
}

export interface Attempt {
  question_id: string;
  created_at: string;
  user_answer: string | null;
  is_correct: boolean | null;
  explanation: string | null;
  korean_draft: string | null;
  chinese_answer: string | null;
  concept_score: number | null;
  concept_checklist: ConceptCheck[] | null;
  grammar_corrections: GrammarCorrection[] | null;
}

export interface SessionData {
  session: { id: string; essay_book_id: string };
  questions: Question[];
  attempts: Attempt[];
  vocab: Vocab | null;
  bookRanges: BookRange[];
}

export type QuizFeedback = 'correct' | { explanation: string; sourcePage: number };

export interface ConceptCheck {
  concept: string;
  covered: boolean;
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

export interface EssayFeedback {
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
}
