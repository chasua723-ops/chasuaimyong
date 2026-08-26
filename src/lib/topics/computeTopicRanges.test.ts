import { describe, it, expect } from 'vitest';
import { computeTopicRanges } from './computeTopicRanges';

describe('computeTopicRanges', () => {
  it('computes each section end page from the next section (or next chapter) start page, and extends the last one to totalPages', () => {
    const result = computeTopicRanges(
      [
        {
          name: '1장',
          startPage: 1,
          children: [
            { name: '1절', startPage: 1 },
            { name: '2절', startPage: 5 },
          ],
        },
        {
          name: '2장',
          startPage: 10,
          children: [{ name: '1절', startPage: 10 }],
        },
      ],
      20
    );

    expect(result).toEqual([
      {
        name: '1장',
        startPage: 1,
        endPage: 9,
        children: [
          { name: '1절', startPage: 1, endPage: 4 },
          { name: '2절', startPage: 5, endPage: 9 },
        ],
      },
      {
        name: '2장',
        startPage: 10,
        endPage: 20,
        children: [{ name: '1절', startPage: 10, endPage: 20 }],
      },
    ]);
  });

  it('treats a childless chapter as its own leaf, ranged against whatever comes next in the book', () => {
    const result = computeTopicRanges(
      [
        { name: '서론', startPage: 1, children: [] },
        {
          name: '1장',
          startPage: 3,
          children: [
            { name: '1절', startPage: 3 },
            { name: '2절', startPage: 8 },
          ],
        },
      ],
      15
    );

    expect(result).toEqual([
      { name: '서론', startPage: 1, endPage: 2, children: [] },
      {
        name: '1장',
        startPage: 3,
        endPage: 15,
        children: [
          { name: '1절', startPage: 3, endPage: 7 },
          { name: '2절', startPage: 8, endPage: 15 },
        ],
      },
    ]);
  });

  it('clamps a leaf to its own start page when a sibling shares the same start page, instead of producing an inverted range', () => {
    // Reproduces a real bug: a TOC page can list two sub-items that both start on that same
    // printed page (e.g. "A. ~· 217" and "B. ~· 217"). The naive "next leaf's start - 1" gave
    // the earlier of the pair an end page one less than its own start page.
    const result = computeTopicRanges(
      [
        {
          name: '1장',
          startPage: 1,
          children: [
            { name: 'A', startPage: 5 },
            { name: 'B', startPage: 5 },
          ],
        },
        { name: '2장', startPage: 10, children: [{ name: '1절', startPage: 10 }] },
      ],
      20
    );

    expect(result[0].children).toEqual([
      { name: 'A', startPage: 5, endPage: 5 },
      { name: 'B', startPage: 5, endPage: 9 },
    ]);
    for (const child of result[0].children) {
      expect(child.endPage).toBeGreaterThanOrEqual(child.startPage);
    }
  });
});
