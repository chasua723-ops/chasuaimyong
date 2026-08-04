import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
import { ingestBook } from './ingest-book';

const [, , filePath, bookName, examDate, targetReadCountStr] = process.argv;

if (!filePath || !bookName || !examDate || !targetReadCountStr) {
  console.error(
    'Usage: npm run ingest:book -- <filePath> <bookName> <examDate:YYYY-MM-DD> <targetReadCount>'
  );
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

ingestBook(
  { filePath, bookName, examDate, targetReadCount: Number(targetReadCountStr) },
  supabase
)
  .then((book) => console.log(`Ingested ${book.name}: ${book.total_pages} pages`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
