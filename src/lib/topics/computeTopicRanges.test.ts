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
});
