import { describe, expect, it } from 'vitest';
import { MAX_DATES, repeatDates, repeatLabel } from '../recurrence';

// The same cases as tests/unit/test_recurrence.py, so the preview matches what the server makes.
describe('repeatDates', () => {
  it('makes weekly and every-other-week dates', () => {
    expect(repeatDates('weekly', '2026-10-27', '2026-11-17')).toEqual([
      '2026-10-27',
      '2026-11-03',
      '2026-11-10',
      '2026-11-17',
    ]);
    expect(repeatDates('biweekly', '2026-10-27', '2026-11-23')).toEqual(['2026-10-27', '2026-11-10']);
  });

  it('keeps the same weekday of the month, skipping a month without a 5th one', () => {
    expect(repeatDates('monthly', '2026-10-13', '2027-01-31')).toEqual([
      '2026-10-13',
      '2026-11-10',
      '2026-12-08',
      '2027-01-12',
    ]);
    expect(repeatDates('monthly', '2026-10-29', '2027-01-31')).toEqual(['2026-10-29', '2026-12-31']);
  });

  it('is empty for missing or backwards dates and stops just past the cap', () => {
    expect(repeatDates('weekly', '2026-10-27', '')).toEqual([]);
    expect(repeatDates('weekly', '2026-10-27', '2026-10-01')).toEqual([]);
    expect(repeatDates('weekly', '2026-10-27', '2028-10-27').length).toBe(MAX_DATES + 1);
  });
});

describe('repeatLabel', () => {
  it('says it in plain words', () => {
    expect(repeatLabel('weekly', '2026-10-27')).toBe('Every Tuesday');
    expect(repeatLabel('biweekly', '2026-10-27')).toBe('Every other Tuesday');
    expect(repeatLabel('monthly', '2026-10-13')).toBe('The 2nd Tuesday of each month');
  });
});
