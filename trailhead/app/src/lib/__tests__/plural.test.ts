import { describe, expect, it } from 'vitest';
import { isAre, plural } from '../plural';

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'badge')).toBe('1 badge');
    expect(plural(0, 'badge')).toBe('0 badges');
    expect(plural(2, 'badge')).toBe('2 badges');
  });

  it('takes an irregular plural', () => {
    expect(plural(1, 'person', 'people')).toBe('1 person');
    expect(plural(3, 'person', 'people')).toBe('3 people');
  });

  it('picks the verb', () => {
    expect(isAre(1)).toBe('is');
    expect(isAre(0)).toBe('are');
  });
});
