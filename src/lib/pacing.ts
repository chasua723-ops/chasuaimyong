export interface PacingInput {
  totalPages: number;
  examDate: string; // ISO date, e.g. '2026-12-01'
  today: string; // ISO date
  targetReadCount: number;
  currentReadCount: number;
  currentPage: number; // 1-indexed, next unread page
}

export interface PacingResult {
  startPage: number;
  endPage: number;
  daysRemaining: number;
  pagesPerDay: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function calculateDailyRange(input: PacingInput): PacingResult {
  const { totalPages, examDate, today, targetReadCount, currentReadCount, currentPage } = input;

  const examMs = new Date(examDate).getTime();
  const todayMs = new Date(today).getTime();
  const daysRemaining = Math.max(1, Math.ceil((examMs - todayMs) / MS_PER_DAY));

  const readsRemaining = Math.max(1, targetReadCount - currentReadCount + 1);
  const pagesLeftInCurrentRead = Math.max(0, totalPages - (currentPage - 1));
  const fullExtraReads = Math.max(0, readsRemaining - 1) * totalPages;
  const totalPagesRemaining = pagesLeftInCurrentRead + fullExtraReads;

  const pagesPerDay = Math.max(1, Math.ceil(totalPagesRemaining / daysRemaining));

  const startPage = currentPage;
  const endPage = Math.min(totalPages, startPage + pagesPerDay - 1);

  return { startPage, endPage, daysRemaining, pagesPerDay };
}
