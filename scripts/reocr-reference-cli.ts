import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '../src/lib/ai/client';
import { reocrReference } from './reocr-reference';

config({ path: '.env.local' });

const [, , filePath, materialName, startPageStr, endPageStr] = process.argv;

if (!filePath || !materialName) {
  console.error(
    'Usage: npm run reocr:reference -- <filePath> <materialName> [startPage] [endPage]'
  );
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count } = await supabase
    .from('reference_materials')
    .select('*', { count: 'exact', head: true })
    .eq('name', materialName);

  if (!count) {
    console.error(`No reference_materials rows found for name: ${materialName}`);
    process.exit(1);
  }

  const startPage = startPageStr ? Number(startPageStr) : undefined;
  const endPage = endPageStr ? Number(endPageStr) : undefined;

  console.log(
    `Re-OCR'ing ${materialName} (${count} pages ingested)${startPage ? ` from page ${startPage}${endPage ? ` to ${endPage}` : ''}` : ''}...`
  );

  const { pagesProcessed, failures } = await reocrReference(
    { filePath, materialName, startPage, endPage, concurrency: 5 },
    supabase,
    getAnthropicClient(),
    (pageNum, total, charCount) => {
      console.log(`  page ${pageNum}/${total}: ${charCount} chars`);
    },
    (pageNum, error) => {
      console.error(`  page ${pageNum}: FAILED — ${error.message}`);
    }
  );

  console.log(`Done. Re-OCR'd ${pagesProcessed} pages for ${materialName}.`);
  if (failures.length > 0) {
    console.log(`${failures.length} page(s) failed: ${failures.map((f) => f.pageNum).join(', ')}`);
    console.log('Re-run with --startPage/--endPage targeting just those pages once resolved.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
