import { describe, expect, it } from 'vitest';
import {
  addMonthsIso,
  dateProblem,
  daysBetween,
  eventProblems,
  type HealthForm,
  partStatus,
  problemText,
  statusForEvent,
  validThrough,
} from '../healthForm';

const part = (date: string) => ({ date, byMemberId: 'm1' });
const form = (ab?: string, c?: string): HealthForm => ({
  id: 'x',
  ...(ab ? { partsAB: part(ab) } : {}),
  ...(c ? { partC: part(c) } : {}),
});

describe('date math', () => {
  it('counts whole days across month, year and leap days', () => {
    expect(daysBetween('2026-10-17', '2026-10-17')).toBe(0);
    expect(daysBetween('2026-10-17', '2026-11-16')).toBe(30);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-10-17', '2026-10-10')).toBe(-7);
  });

  it('adds months and clamps to the end of a shorter month', () => {
    expect(addMonthsIso('2026-03-10', 12)).toBe('2027-03-10');
    expect(addMonthsIso('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsIso('2026-12-15', 24)).toBe('2028-12-15');
  });

  it('is good for 12 months, through the same day a year later', () => {
    expect(validThrough('2026-03-10')).toBe('2027-03-10');
  });
});

describe('partStatus', () => {
  it('is missing without a date', () => {
    expect(partStatus(undefined, '2026-10-17')).toBe('missing');
  });

  it('is current, then expiring in the last 30 days, then expired the day after', () => {
    const p = part('2025-11-16'); // good through 2026-11-16
    expect(partStatus(p, '2026-10-16')).toBe('current'); // 31 days left
    expect(partStatus(p, '2026-10-17')).toBe('expiring'); // 30 days left
    expect(partStatus(p, '2026-11-16')).toBe('expiring'); // the last good day
    expect(partStatus(p, '2026-11-17')).toBe('expired');
  });

  it('treats Part C as a 12 month physical too', () => {
    expect(partStatus(part('2026-03-01'), '2027-03-01')).toBe('expiring');
    expect(partStatus(part('2026-03-01'), '2027-03-02')).toBe('expired');
  });
});

describe('events', () => {
  it('judges a form on the event last day, not today', () => {
    const p = part('2025-11-16'); // good through 2026-11-16
    expect(statusForEvent(p, '2026-11-16')).toBe('current');
    expect(statusForEvent(p, '2026-11-17')).toBe('expired');
    expect(statusForEvent(undefined, '2026-11-17')).toBe('missing');
  });

  it('only checks Part C when the event needs A, B and C', () => {
    const f = form('2026-09-01');
    expect(eventProblems('ab', f, '2026-12-01')).toEqual([]);
    expect(eventProblems('abc', f, '2026-12-01')).toEqual([{ part: 'partC', status: 'missing' }]);
    expect(eventProblems('abc', undefined, '2026-12-01').map((p) => p.part)).toEqual(['partsAB', 'partC']);
  });

  it('flags a form that expires before a long camp ends', () => {
    const f = form('2025-12-01', '2026-06-01');
    const problems = eventProblems('abc', f, '2026-12-05');
    expect(problems).toEqual([{ part: 'partsAB', status: 'expired' }]);
    expect(problemText(problems)).toBe('Parts A and B expired by then');
  });

  it('does not flag a form that is expiring but still valid on the day', () => {
    expect(eventProblems('ab', form('2025-12-01'), '2026-11-30')).toEqual([]);
  });
});

describe('dateProblem', () => {
  it('accepts today and earlier dates', () => {
    expect(dateProblem('2026-10-17', '2026-10-17')).toBeNull();
    expect(dateProblem('2025-01-02', '2026-10-17')).toBeNull();
  });

  it('refuses blank, malformed, future and very old dates', () => {
    expect(dateProblem('', '2026-10-17')).toBe('Enter the date on the form.');
    expect(dateProblem('10/17/2026', '2026-10-17')).toBe('Enter the date on the form.');
    expect(dateProblem('2026-10-18', '2026-10-17')).toBe('The date can not be in the future.');
    expect(dateProblem('1999-12-31', '2026-10-17')).toBe('That date is too long ago.');
  });
});
