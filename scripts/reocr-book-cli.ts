import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '../src/lib/ai/client';
import { reocrBook } from './reocr-book';

config({ path: '.env.local' });

const [, , filePath, bookName, startPageStr, endPageStr] = process.argv;

if (!filePath || !bookName) {
  console.error(
    'Usage: npm run reocr:book -- <filePath> <bookName> [startPage] [endPage]'
  );
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: book, error } = await supabase.from('books').select('*').eq('name', bookName).single();
  if (error || !book) {
    console.error(`Book not found: ${bookName}`, error);
    process.exit(1);
  }

  const startPage = startPageStr ? Number(startPageStr) : undefined;
  const endPage = endPageStr ? Number(endPageStr) : undefined;

  console.log(`Re-OCR'ing ${book.name} (${book.total_pages} pages)${startPage ? ` from page ${startPage}${endPage ? ` to ${endPage}` : ''}` : ''}...`);

  const { pagesProcessed, failures } = await reocrBook(
    { filePath, bookId: book.id, startPage, endPage, concurrency: 5 },
    supabase,
    getAnthropicClient(),
    (pageNum, total, charCount) => {
      console.log(`  page ${pageNum}/${total}: ${charCount} chars`);
    },
    (pageNum, error) => {
      console.error(`  page ${pageNum}: FAILED — ${error.message}`);
    }
  );

  console.log(`Done. Re-OCR'd ${pagesProcessed} pages for ${book.name}.`);
  if (failures.length > 0) {
    console.log(`${failures.length} page(s) failed: ${failures.map((f) => f.pageNum).join(', ')}`);
    console.log('Re-run with --startPage/--endPage targeting just those pages once resolved.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
