import { describe, expect, it } from 'vitest';
import { findDate, parseBadgeList } from '../priorImport';

describe('findDate', () => {
  it('reads ISO and US dates, including two-digit years', () => {
    expect(findDate('Camping 2024-7-5')?.iso).toBe('2024-07-05');
    expect(findDate('Camping, 07/15/2024')?.iso).toBe('2024-07-15');
    expect(findDate('Camping 7/15/24')?.iso).toBe('2024-07-15');
    expect(findDate('Camping')).toBeNull();
  });
});

describe('parseBadgeList', () => {
  it('matches names with punctuation, "merit badge" and extra words', () => {
    const text = [
      'Camping Merit Badge, 07/15/2024',
      'citizenship in the community\t2024-03-02',
      'Signs Signals and Codes - 5/1/2025',
      'Fish & Wildlife Management 6/2/2025',
      'Swimming — earned at summer camp 7/20/2024',
    ].join('\n');
    const { matched, unmatched } = parseBadgeList(text);
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => m.awardId)).toEqual([
      'camping',
      'citizenship-in-the-community',
      'signs-signals-and-codes',
      'fish-and-wildlife-management',
      'swimming',
    ]);
  });

  it('prefers the longest matching name', () => {
    const { matched } = parseBadgeList('Fly Fishing 2025-06-01');
    expect(matched[0].awardId).toBe('fly-fishing');
  });

  it('reports lines it cannot use, and uses the fallback date when a line has none', () => {
    const { matched, unmatched } = parseBadgeList('Underwater Basket Weaving 2025-01-01\nChess\nArt', '2024-09-01');
    expect(unmatched).toEqual([{ line: 'Underwater Basket Weaving 2025-01-01', reason: "Couldn't find a merit badge name" }]);
    expect(matched.map((m) => [m.awardId, m.date])).toEqual([
      ['chess', '2024-09-01'],
      ['art', '2024-09-01'],
    ]);
    expect(parseBadgeList('Chess').unmatched[0].reason).toBe('No date');
  });

  it('keeps the first entry when a badge is listed twice', () => {
    expect(parseBadgeList('Chess 2024-01-01\nChess 2024-02-01').matched).toHaveLength(1);
  });
});
