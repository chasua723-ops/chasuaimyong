import { describe, it, expect, vi } from 'vitest';
import { ingestReference } from './ingest-reference';

vi.mock('node:fs/promises', () => {
  const readFile = vi.fn(async () => Buffer.from('fake-pdf-bytes'));
  return { readFile, default: { readFile } };
});

vi.mock('../src/lib/pdf/extractPages', () => ({
  extractPagesFromBuffer: vi.fn(async () => [{ pageNum: 1, content: '기출 문제 1' }]),
}));

describe('ingestReference', () => {
  it('inserts one row per page tagged with the material name', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: vi.fn(() => ({ insert })) } as any;

    await ingestReference({ filePath: 'fake.pdf', materialName: '독해기출 특강' }, supabase);

    expect(supabase.from).toHaveBeenCalledWith('reference_materials');
    expect(insert).toHaveBeenCalledWith([
      { name: '독해기출 특강', page_num: 1, content: '기출 문제 1' },
    ]);
  });
});
