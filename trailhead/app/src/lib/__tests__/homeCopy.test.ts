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

describe('noScoutsText for roles with their own pages', () => {
  it('points a treasurer to Accounts and does not ask them to add a Scout', () => {
    expect(noScoutsText(['treasurer'])).toMatch(/Scout accounts are under Accounts/);
    expect(noScoutsText(['treasurer'])).not.toMatch(/Add your Scout/);
  });

  it('points a quartermaster to Equipment', () => {
    expect(noScoutsText(['quartermaster'])).toMatch(/troop gear is under Equipment/);
  });

  it('names every job for someone with several roles', () => {
    const text = noScoutsText(['treasurer', 'quartermaster']);
    expect(text).toMatch(/Accounts/);
    expect(text).toMatch(/Equipment/);
  });

  it('points a committee member to Announcements', () => {
    expect(noScoutsText(['committee'])).toMatch(/under Announcements/);
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

  it('does not ask a leader who cannot act on blue cards to act', () => {
    expect(blueCardAction(0, false)).toEqual({ text: 'No blue cards are waiting', waiting: false });
    expect(blueCardAction(2, false)).toEqual({
      text: '2 blue cards waiting for the Scoutmaster or advancement chair',
      waiting: false,
    });
  });
});
