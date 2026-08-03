import { readFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractPagesFromBuffer } from '../src/lib/pdf/extractPages';

export interface IngestReferenceArgs {
  filePath: string;
  materialName: string;
}

export async function ingestReference(args: IngestReferenceArgs, supabase: SupabaseClient) {
  const buffer = await readFile(args.filePath);
  const pages = await extractPagesFromBuffer(buffer);

  const rows = pages.map((p) => ({
    name: args.materialName,
    page_num: p.pageNum,
    content: p.content,
  }));

  const { error } = await supabase.from('reference_materials').insert(rows);
  if (error) throw error;
}
