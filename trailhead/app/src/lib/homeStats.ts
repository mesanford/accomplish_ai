// The numbers on a leader's home screen, from documents already loaded. Pure, so it is easy to test.
import type { TroopEvent } from './types';

export const SOON_DAYS = 14;

/** YYYY-MM-DD `days` after `today` (also YYYY-MM-DD). */
export function addDays(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Events from today through the next two weeks, soonest first. Cancelled ones stay, marked, so nobody is surprised. */
export function soonEvents(events: TroopEvent[], today: string, days = SOON_DAYS): TroopEvent[] {
  const last = addDays(today, days);
  return events.filter((e) => e.start >= today && e.start <= last).sort((a, b) => a.start.localeCompare(b.start));
}

export interface LeaderStats {
  soonEvents: number;
  permissionWaiting: number;
  scouts: number;
  scoutsWithPath: number;
}

export function leaderStats(
  events: TroopEvent[],
  today: string,
  scoutIds: string[],
  pathScoutIds: string[],
): LeaderStats {
  const soon = soonEvents(events, today).filter((e) => !e.cancelled);
  const upcoming = events.filter((e) => e.start >= today && !e.cancelled);
  const withPath = new Set(pathScoutIds);
  return {
    soonEvents: soon.length,
    permissionWaiting: upcoming.reduce((n, e) => n + (e.signupCounts?.waitingPermission ?? 0), 0),
    scouts: scoutIds.length,
    scoutsWithPath: scoutIds.filter((id) => withPath.has(id)).length,
  };
}
