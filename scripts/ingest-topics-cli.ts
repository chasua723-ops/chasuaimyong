// scripts/ingest-topics-cli.ts
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
import { ingestTopics } from './ingest-topics';
import { getAnthropicClient } from '../src/lib/ai/client';

const [, , bookId, tocStartPageStr, tocEndPageStr] = process.argv;

if (!bookId || !tocStartPageStr || !tocEndPageStr) {
  console.error('Usage: npm run ingest:topics -- <bookId> <tocStartPage> <tocEndPage>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

ingestTopics(supabase, getAnthropicClient(), {
  bookId,
  tocStartPage: Number(tocStartPageStr),
  tocEndPage: Number(tocEndPageStr),
})
  .then((count) => console.log(`Inserted ${count} topics`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
