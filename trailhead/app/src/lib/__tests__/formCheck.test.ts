import { describe, expect, it } from 'vitest';
import { joinList, stillNeeded } from '../formCheck';

describe('stillNeeded', () => {
  it('names every empty field', () => {
    expect(stillNeeded([['the troop name', ''], ['the unit number', '  '], ['your name', 'Sam']])).toBe(
      'Still needed: the troop name and the unit number.',
    );
  });

  it('is null when everything is filled in', () => {
    expect(stillNeeded([['your name', 'Sam']])).toBeNull();
  });
});

describe('joinList', () => {
  it('reads as a sentence', () => {
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
