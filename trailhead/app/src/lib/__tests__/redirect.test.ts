import { describe, expect, it } from 'vitest';
import { safeNext } from '../redirect';

describe('safeNext', () => {
  it('keeps a path inside the app', () => {
    expect(safeNext('/join/t1/abc')).toBe('/join/t1/abc');
    expect(safeNext('/t/t1/badges')).toBe('/t/t1/badges');
  });

  it('goes home when there is nothing usable', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext('badges')).toBe('/');
  });

  it('refuses another site', () => {
    expect(safeNext('https://example.com')).toBe('/');
    expect(safeNext('//example.com/x')).toBe('/');
    expect(safeNext('/\\example.com')).toBe('/');
  });

  it('does not loop back to sign-in', () => {
    expect(safeNext('/signin')).toBe('/');
    expect(safeNext('/signin/finish')).toBe('/');
  });
});
