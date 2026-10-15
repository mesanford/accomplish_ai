import { describe, expect, it } from 'vitest';
import { consentSummary, mayBeUnder13 } from '../consent';
import type { ConsentDoc } from '../types';

const at = (iso: string) => ({ toDate: () => new Date(iso) }) as never;
const doc = (extra: Partial<ConsentDoc>): ConsentDoc => ({ id: 's1', ...extra });

describe('mayBeUnder13', () => {
  const today = new Date(2026, 9, 14); // October 2026

  it('assumes the latest birthday in the birth month', () => {
    expect(mayBeUnder13(2013, 10, today)).toBe(true); // turns 13 sometime this month
    expect(mayBeUnder13(2013, 9, today)).toBe(false);
    expect(mayBeUnder13(2015, 3, today)).toBe(true);
    expect(mayBeUnder13(2010, 3, today)).toBe(false);
  });

  it('ignores a half-typed year', () => {
    expect(mayBeUnder13(0, 1, today)).toBe(false);
    expect(mayBeUnder13(201, 1, today)).toBe(false);
    expect(mayBeUnder13(Number.NaN, 1, today)).toBe(false);
  });
});

describe('consentSummary', () => {
  it('asks for a parent when none has joined', () => {
    expect(consentSummary(null, false)).toMatchObject({ text: 'Waiting for a parent to join', tone: 'warn' });
  });

  it('notes a parent who joined before consent was recorded', () => {
    expect(consentSummary(undefined, true).text).toBe('No parent consent recorded');
  });

  it('shows the date a parent agreed', () => {
    const given = doc({ parentConsents: [{ uid: 'u', memberId: 'm', version: 'v', at: at('2026-10-15T12:00:00Z') }] });
    expect(consentSummary(given, true)).toMatchObject({ text: expect.stringMatching(/^Parent consent: given .*2026/), tone: 'good' });
  });

  it('shows a leader confirmation until a parent agrees', () => {
    const confirmed = doc({ leaderConfirmation: { uid: 'u', memberId: 'm', at: at('2026-10-15T12:00:00Z') } });
    expect(consentSummary(confirmed, false).text).toMatch(/^Leader confirmed permission/);
  });

  it('flags a withdrawal above everything else', () => {
    const withdrawn = doc({
      parentConsents: [{ uid: 'u', memberId: 'm', version: 'v' }],
      withdrawal: { uid: 'u', memberId: 'm' },
    });
    expect(consentSummary(withdrawn, true)).toMatchObject({ tone: 'bad', withdrawn: true });
  });
});
