import { describe, expect, it } from 'vitest';
import { blueCardAction, noScoutsText } from '../homeCopy';

describe('noScoutsText', () => {
  it('tells a parent to add their Scout', () => {
    expect(noScoutsText(['parent'])).toMatch(/Add your Scout below/);
  });

  it('does not tell a counselor to add a Scout', () => {
    expect(noScoutsText(['counselor'])).not.toMatch(/Add your Scout/);
    expect(noScoutsText(['counselor'])).toMatch(/merit badge/);
  });

  it('keeps the parent wording for someone who is both', () => {
    expect(noScoutsText(['counselor', 'parent'])).toMatch(/Add your Scout below/);
  });
});

describe('blueCardAction', () => {
  it('is quiet when nothing is waiting', () => {
    expect(blueCardAction(0)).toEqual({ text: 'No blue cards need action', waiting: false });
  });

  it('counts what is waiting', () => {
    expect(blueCardAction(1)).toEqual({ text: '1 blue card needs action', waiting: true });
    expect(blueCardAction(3).text).toBe('3 blue cards need action');
  });
});
