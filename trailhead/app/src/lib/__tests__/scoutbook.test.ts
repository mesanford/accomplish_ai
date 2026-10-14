import { describe, expect, it } from 'vitest';
import { groupByScout, reportToCsv } from '../scoutbook';
import type { ScoutbookRow } from '../types';

const rows: ScoutbookRow[] = [
  { scoutId: 'a', scoutName: 'Alex', kind: 'rank', awardId: 'first-class', awardName: 'First Class', date: '2026-09-01' },
  {
    scoutId: 'b',
    scoutName: 'Sam "Sammy" Lee',
    kind: 'requirement',
    awardId: 'camping',
    awardName: 'Camping',
    requirement: '4a, b',
    date: '2026-09-10',
    signedBy: 'Pat Leader',
  },
  { scoutId: 'b', scoutName: 'Sam "Sammy" Lee', kind: 'merit_badge', awardId: 'camping', awardName: 'Camping', date: '2026-09-12' },
];

describe('scoutbook report', () => {
  it('writes a header and one line per row', () => {
    const lines = reportToCsv(rows).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Scout,Type,Award,Requirement,Date,Signed by');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('Alex,Rank,First Class,,2026-09-01,');
  });

  it('quotes commas and quotation marks', () => {
    const line = reportToCsv(rows).split('\r\n')[2];
    expect(line).toBe('"Sam ""Sammy"" Lee",Requirement,Camping,"4a, b",2026-09-10,Pat Leader');
  });

  it('keeps spreadsheet formulas from running', () => {
    const csv = reportToCsv([{ ...rows[0], scoutName: '=HYPERLINK("x")' }]);
    expect(csv.split('\r\n')[1].startsWith('"\'=HYPERLINK')).toBe(true);
  });

  it('groups rows by Scout in order', () => {
    const groups = groupByScout(rows);
    expect(groups.map((g) => [g.scoutName, g.rows.length])).toEqual([
      ['Alex', 1],
      ['Sam "Sammy" Lee', 2],
    ]);
  });
});
