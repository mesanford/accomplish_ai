// The troop's own past trips, offered as starting points on a plan's research step.
import type { PlanKind } from './plans';
import type { TroopEvent } from './types';

export interface PastTrip {
  /** What a research card would be called: the place, or the event's name if it had no place. */
  name: string;
  /** The most recent time the troop went. */
  lastDate: string;
  lastTitle: string;
  times: number;
}

/** Past events of the same kind (any kind for "other"), one per place, most recent first, leaving out cancelled
 * events and places already on the plan. */
export function pastTrips(events: TroopEvent[], kind: PlanKind, today: string, taken: string[], limit = 6): PastTrip[] {
  const skip = new Set(taken.map((t) => t.trim().toLowerCase()));
  const byName = new Map<string, PastTrip>();
  for (const ev of events) {
    const end = ev.endDate ?? ev.start;
    if (ev.cancelled || !end || end >= today || (kind !== 'other' && ev.logKind !== kind)) {
      continue;
    }
    const name = (ev.place || ev.title || '').trim();
    const key = name.toLowerCase();
    if (!name || skip.has(key)) {
      continue;
    }
    const seen = byName.get(key);
    if (!seen) {
      byName.set(key, { name, lastDate: ev.start, lastTitle: ev.title, times: 1 });
    } else {
      seen.times += 1;
      if (ev.start > seen.lastDate) {
        seen.lastDate = ev.start;
        seen.lastTitle = ev.title;
      }
    }
  }
  return [...byName.values()].sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1)).slice(0, limit);
}
