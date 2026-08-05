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

export interface SessionData {
  session: { id: string; essay_book_id: string };
  questions: Question[];
  vocab: Vocab | null;
  bookRanges: BookRange[];
}

export type QuizFeedback = 'correct' | { explanation: string; sourcePage: number };

export interface EssayFeedback {
  contentScore: number;
  chineseScore: number;
  feedback: string;
}
