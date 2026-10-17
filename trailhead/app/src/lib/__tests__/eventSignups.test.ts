import { describe, expect, it } from 'vitest';
import {
  audienceAllows,
  calendarUrls,
  centsToDollars,
  closedReason,
  dollarsToCents,
  formatFee,
  newQuestionId,
  parseChoices,
  spotsLine,
} from '../eventSignups';

describe('fees', () => {
  it('turns dollars into whole cents', () => {
    expect(dollarsToCents('25')).toBe(2500);
    expect(dollarsToCents('$12.50')).toBe(1250);
    expect(dollarsToCents('0.05')).toBe(5);
    expect(dollarsToCents('')).toBe(0);
  });

  it('refuses anything that is not a price', () => {
    for (const bad of ['abc', '-5', '1.234', '1,000', '12.', '1e3']) {
      expect(dollarsToCents(bad)).toBeNull();
    }
  });

  it('shows a fee plainly', () => {
    expect(formatFee(2500)).toBe('$25');
    expect(formatFee(1250)).toBe('$12.50');
    expect(formatFee(0)).toBe('');
    expect(formatFee(undefined)).toBe('');
    expect(centsToDollars(1250)).toBe('12.50');
    expect(centsToDollars(2500)).toBe('25');
  });
});

describe('sign-up status text', () => {
  it('says how full an event is', () => {
    expect(spotsLine(12, 20, 0)).toBe('12 of 20 spots filled');
    expect(spotsLine(20, 20, 3)).toBe('20 of 20 spots filled, 3 on the waitlist');
    expect(spotsLine(4, null, 0)).toBe('4 signed up');
  });

  it('explains why sign-up is closed', () => {
    const open = { enabled: true, audience: 'both' as const, deadline: '2026-10-15' };
    expect(closedReason(open, '2026-10-20', '2026-10-15')).toBe('');
    expect(closedReason(open, '2026-10-20', '2026-10-16')).toBe('The sign-up deadline has passed.');
    expect(closedReason({ ...open, closed: true }, '2026-10-20', '2026-10-01')).toBe('Sign-ups are closed.');
    expect(closedReason({ ...open, deadline: null }, '2026-10-20', '2026-10-21')).toBe('This event is over.');
  });

  it('applies the audience', () => {
    expect(audienceAllows('both', 'scout')).toBe(true);
    expect(audienceAllows('scouts', 'adult')).toBe(false);
    expect(audienceAllows('adults', 'adult')).toBe(true);
  });
});

describe('question helpers', () => {
  it('makes unused ids', () => {
    expect(newQuestionId([])).toBe('q1');
    expect(newQuestionId(['q1', 'q2'])).toBe('q3');
    expect(newQuestionId(['q2'])).toBe('q3');
  });

  it('cleans a list of choices', () => {
    expect(parseChoices(' S, M ,, L ')).toEqual(['S', 'M', 'L']);
    expect(parseChoices('a,b,c,d,e,f,g,h,i,j,k,l')).toHaveLength(10);
  });
});

describe('calendar addresses', () => {
  it('gives an https and a webcal address', () => {
    expect(calendarUrls('https://app.example.com', '/cal/abc.ics')).toEqual({
      https: 'https://app.example.com/cal/abc.ics',
      webcal: 'webcal://app.example.com/cal/abc.ics',
    });
    expect(calendarUrls('http://localhost:5000', '/cal/abc.ics').webcal).toBe('webcal://localhost:5000/cal/abc.ics');
  });
});
