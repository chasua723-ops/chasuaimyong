/* eslint-disable @typescript-eslint/no-explicit-any -- flexible chainable mock; rows/payloads are untyped by design */
import { vi } from 'vitest';

type TableData = Record<string, any[]>;

export function createMockSupabase(tables: TableData) {
  const inserted: Record<string, any[]> = {};
  const store: TableData = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, [...v]])
  );

  function builder(table: string) {
    let rows = store[table] ?? [];

    const api: any = {
      select: () => api,
      order: () => api,
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val);
        return api;
      },
      gte: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] >= val);
        return api;
      },
      lte: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] <= val);
        return api;
      },
      ilike: (col: string, pattern: string) => {
        const needle = pattern.replace(/%/g, '');
        rows = rows.filter((r) => String(r[col]).includes(needle));
        return api;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return api;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      insert: (payload: any) => {
        const arr = Array.isArray(payload) ? payload : [payload];
        inserted[table] = [...(inserted[table] ?? []), ...arr];
        const withId = arr.map((r, i) => ({
          id: `${table}-${(store[table]?.length ?? 0) + i}`,
          ...r,
        }));
        store[table] = [...(store[table] ?? []), ...withId];
        rows = withId;
        return api;
      },
      update: (payload: any) => ({
        eq: async (col: string, val: any) => {
          store[table] = (store[table] ?? []).map((r) =>
            r[col] === val ? { ...r, ...payload } : r
          );
          return { data: store[table].filter((r) => r[col] === val), error: null };
        },
      }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return api;
  }

  return {
    from: vi.fn((table: string) => builder(table)),
    inserted,
  };
}
