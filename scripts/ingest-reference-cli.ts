import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
import { ingestReference } from './ingest-reference';

const [, , filePath, materialName] = process.argv;

if (!filePath || !materialName) {
  console.error('Usage: npm run ingest:reference -- <filePath> <materialName>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

ingestReference({ filePath, materialName }, supabase)
  .then(() => console.log(`Ingested reference material: ${materialName}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
