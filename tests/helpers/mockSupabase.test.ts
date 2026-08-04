import { describe, expect, it } from 'vitest';
import { createMockSupabase } from './mockSupabase';

describe('createMockSupabase sanity check', () => {
  it('insert() then select().eq() reads the row back with a unique id', async () => {
    const supabase = createMockSupabase({ questions: [] });

    const { data: insertedRow } = await supabase
      .from('questions')
      .insert({ prompt: 'What is 2+2?' })
      .select()
      .single();

    expect(insertedRow.id).toBe('questions-0');
    expect(insertedRow.prompt).toBe('What is 2+2?');

    const { data: fetched } = await supabase
      .from('questions')
      .select()
      .eq('id', 'questions-0')
      .maybeSingle();

    expect(fetched).toEqual(insertedRow);
  });

  it('select() awaited directly via the thenable works without single()/maybeSingle()', async () => {
    const supabase = createMockSupabase({
      questions: [
        { id: 'q1', level: 3 },
        { id: 'q2', level: 5 },
      ],
    });

    const { data, error } = await supabase.from('questions').select('*');

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('update().eq() mutates the underlying stored rows, not just the filtered view', async () => {
    const supabase = createMockSupabase({
      questions: [{ id: 'q1', level: 3, prompt: 'old' }],
    });

    await supabase.from('questions').update({ prompt: 'new' }).eq('id', 'q1');

    // Fresh query from a brand-new builder call must see the mutation.
    const { data } = await supabase.from('questions').select().eq('id', 'q1').maybeSingle();
    expect(data.prompt).toBe('new');
  });

  it('gte()/lte() range filtering narrows rows correctly', async () => {
    const supabase = createMockSupabase({
      questions: [
        { id: 'q1', level: 1 },
        { id: 'q2', level: 3 },
        { id: 'q3', level: 5 },
        { id: 'q4', level: 7 },
      ],
    });

    const { data } = await supabase.from('questions').select().gte('level', 3).lte('level', 5);
    expect(data.map((r: { id: string }) => r.id)).toEqual(['q2', 'q3']);
  });

  it('limit() truncates the result set', async () => {
    const supabase = createMockSupabase({
      questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
    });

    const { data } = await supabase.from('questions').select().limit(2);
    expect(data).toHaveLength(2);
  });

  it('ilike() performs a case-sensitive substring match ignoring % wildcards', async () => {
    const supabase = createMockSupabase({
      questions: [{ id: 'q1', prompt: 'hello world' }, { id: 'q2', prompt: 'goodbye' }],
    });

    const { data } = await supabase.from('questions').select().ilike('prompt', '%world%');
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('q1');
  });

  it('inserted[table] accumulates across multiple insert() calls to the same table', async () => {
    const supabase = createMockSupabase({ questions: [] });

    await supabase.from('questions').insert({ prompt: 'first' }).select().single();
    await supabase.from('questions').insert([{ prompt: 'second' }, { prompt: 'third' }]).select();

    expect(supabase.inserted.questions).toHaveLength(3);
    expect(supabase.inserted.questions.map((r: { prompt: string }) => r.prompt)).toEqual([
      'first',
      'second',
      'third',
    ]);

    // ids assigned across both inserts must be unique
    const { data: all } = await supabase.from('questions').select('*');
    const ids = all.map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['questions-0', 'questions-1', 'questions-2']);
  });

  it('supabase.from is a vi.fn mock that can be asserted on', async () => {
    const supabase = createMockSupabase({ questions: [] });
    await supabase.from('questions').select('*');
    expect(supabase.from).toHaveBeenCalledWith('questions');
  });
});
