import { describe, it, expect, vi } from 'vitest';
import { ingestBook } from './ingest-book';

vi.mock('node:fs/promises', () => {
  const readFile = vi.fn(async () => Buffer.from('fake-pdf-bytes'));
  return { readFile, default: { readFile } };
});

vi.mock('../src/lib/pdf/extractPages', () => ({
  extractPagesFromBuffer: vi.fn(async () => [
    { pageNum: 1, content: 'first page' },
    { pageNum: 2, content: 'second page' },
  ]),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMockSupabase(insertedBook: any) {
  const single = vi.fn().mockResolvedValue({ data: insertedBook, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const booksInsert = vi.fn().mockReturnValue({ select });
  const pagesInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === 'books') return { insert: booksInsert };
    if (table === 'book_pages') return { insert: pagesInsert };
    throw new Error(`unexpected table ${table}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from, booksInsert, pagesInsert } as any;
}

describe('ingestBook', () => {
  it('inserts a book row then page rows linked by the new book id', async () => {
    const insertedBook = { id: 'book-1', name: '문법', total_pages: 2 };
    const supabase = buildMockSupabase(insertedBook);

    const result = await ingestBook(
      { filePath: 'fake.pdf', bookName: '문법', examDate: '2027-01-01', targetReadCount: 3 },
      supabase
    );

    expect(result).toEqual(insertedBook);
    expect(supabase.booksInsert).toHaveBeenCalledWith({
      name: '문법',
      total_pages: 2,
      exam_date: '2027-01-01',
      target_read_count: 3,
      current_read_count: 1,
      current_page: 1,
    });
    expect(supabase.pagesInsert).toHaveBeenCalledWith([
      { book_id: 'book-1', page_num: 1, content: 'first page' },
      { book_id: 'book-1', page_num: 2, content: 'second page' },
    ]);
  });
});
