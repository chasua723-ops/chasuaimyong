export type QuestionType = 'grammar' | 'vocab' | 'reading' | 'theory' | 'essay';

export interface Book {
  id: string;
  name: string;
  total_pages: number;
  exam_date: string;
  target_read_count: number;
  current_read_count: number;
  current_page: number;
}

export interface BookPage {
  id: string;
  book_id: string;
  page_num: number;
  content: string;
}

export interface ReferenceMaterial {
  id: string;
  name: string;
  page_num: number;
  content: string;
}

export interface DailySession {
  id: string;
  date: string;
  essay_book_id: string | null;
  completed: boolean;
}

export interface QuestionRow {
  id: string;
  book_id: string;
  session_id: string;
  type: QuestionType;
  source_page: number;
  prompt: string;
  choices: string[] | null;
  correct_answer: string;
  used_reference: boolean;
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

export interface AttemptRow {
  id: string;
  question_id: string;
  user_answer: string | null;
  is_correct: boolean | null;
  explanation: string | null;
  korean_draft: string | null;
  chinese_answer: string | null;
  content_score: number | null;
  chinese_score: number | null;
  ai_feedback: string | null;
  concept_score: number | null;
  concept_checklist: ConceptCheck[] | null;
  grammar_corrections: GrammarCorrection[] | null;
}

export interface CategoryStatRow {
  id: string;
  type: QuestionType;
  correct_count: number;
  total_count: number;
}

export interface VocabOfTheDay {
  id: string;
  date: string;
  word_zh: string;
  pinyin: string;
  meaning_ko: string;
  example_zh: string;
  example_ko: string;
}
