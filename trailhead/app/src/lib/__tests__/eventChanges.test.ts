import { describe, expect, it } from 'vitest';
import { clockText, whoHears } from '../eventChanges';

describe('clockText', () => {
  it('reads like the alert emails', () => {
    expect(clockText('19:30')).toBe('7:30 pm');
    expect(clockText('00:05')).toBe('12:05 am');
    expect(clockText('12:00')).toBe('12:00 pm');
    expect(clockText('soon')).toBe('soon');
    expect(clockText(undefined)).toBe('');
  });
});

describe('whoHears', () => {
  it('names who gets the alert', () => {
    expect(whoHears(true)).toContain('signed up');
    expect(whoHears(false)).toContain("troop's adults and parents");
  });
});
