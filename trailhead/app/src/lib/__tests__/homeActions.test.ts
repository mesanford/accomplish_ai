import { describe, expect, it } from 'vitest';
import { homeActions, type Who } from '../homeActions';

const nobody: Who = { isLeader: false, canPost: false, counselor: false, parent: false, accounts: false };
const keys = (who: Partial<Who>) => homeActions({ ...nobody, ...who }).map((a) => a.key);

describe('homeActions', () => {
  it('gives a leader the troop jobs, with settings last', () => {
    expect(keys({ isLeader: true, canPost: true })).toEqual([
      'event',
      'message',
      'scouts',
      'advance',
      'cards',
      'attendance',
      'settings',
    ]);
  });

  it('gives a parent their family jobs', () => {
    expect(keys({ parent: true })).toEqual(['signup', 'path', 'leader', 'health']);
  });

  it('adds what other roles do, without repeats, and never more than eight', () => {
    expect(keys({ parent: true, canPost: true, counselor: true })).toEqual([
      'signup',
      'path',
      'leader',
      'health',
      'message',
      'counseling',
    ]);
    expect(keys({ isLeader: true, canPost: true, counselor: true, accounts: true })).toHaveLength(8);
  });

  it('invites a Scout to plan trips first', () => {
    const scout = homeActions({ isLeader: false, canPost: false, counselor: false, parent: false, accounts: false, scout: true });
    expect(scout.map((a) => a.key).slice(0, 2)).toEqual(['trip', 'signup']);
  });

  it('always offers something', () => {
    expect(keys({})).toEqual(['signup', 'leader']);
  });

  it('points to places inside the troop', () => {
    expect(homeActions({ ...nobody, isLeader: true }).find((a) => a.key === 'message')?.to).toBe('announcements?new=1');
  });
});
