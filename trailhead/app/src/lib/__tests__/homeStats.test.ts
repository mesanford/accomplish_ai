import { describe, expect, it } from 'vitest';
import { addDays, leaderStats, soonEvents } from '../homeStats';
import type { TroopEvent } from '../types';

const ev = (id: string, start: string, extra: Partial<TroopEvent> = {}): TroopEvent => ({ id, title: id, start, ...extra });
const TODAY = '2026-10-20';
const EVENTS = [
  ev('past', '2026-10-19'),
  ev('meet', '2026-10-27'),
  ev('camp', '2026-10-24', { signupCounts: { held: 4, going: 3, waitingPermission: 2, waitlist: 0 } }),
  ev('off', '2026-10-22', { cancelled: true, signupCounts: { held: 1, going: 0, waitingPermission: 5, waitlist: 0 } }),
  ev('later', '2026-12-12', { signupCounts: { held: 1, going: 0, waitingPermission: 1, waitlist: 0 } }),
];

describe('home stats', () => {
  it('adds days across a month', () => {
    expect(addDays('2026-10-25', 14)).toBe('2026-11-08');
  });

  it('lists the next two weeks soonest first, cancelled ones included', () => {
    expect(soonEvents(EVENTS, TODAY).map((e) => e.id)).toEqual(['off', 'camp', 'meet']);
  });

  it('counts what a leader needs to know', () => {
    expect(leaderStats(EVENTS, TODAY, ['s1', 's2', 's3'], ['s1', 's3', 'gone'])).toEqual({
      soonEvents: 2, // not the cancelled one
      permissionWaiting: 3, // camp and later; not the cancelled event
      scouts: 3,
      scoutsWithPath: 2, // a path for a Scout who left doesn't count
    });
  });
});
