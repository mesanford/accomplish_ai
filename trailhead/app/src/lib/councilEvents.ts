// A council's public calendar, read once a day into councilEvents/{council} (functions/endpoints/council_calendar.py)
// and shown read-only beside the troop's own calendar. Mirrors functions/handlers/council_calendar.py.
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface CouncilEvent {
  title: string;
  start: string;
  /** The last day, for an event of more than one day. */
  end: string | null;
  place: string;
  url: string | null;
  /** A repeating event: only its first date is shown. */
  repeats: boolean;
}

const SKIP = new Set(['council', 'bsa', 'scouting', 'america', 'of', 'the']);

/** How troops in the same council are matched: "Bay-Lakes Council, BSA" and "Bay Lakes" are both "bay-lakes". */
export function councilKey(council: string | null | undefined): string | null {
  const words = (council ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return words.filter((w) => !SKIP.has(w)).join('-').slice(0, 80) || null;
}

/** Council events on any day from `first` to `last`. */
export function councilEventsIn(events: CouncilEvent[], first: string, last: string): CouncilEvent[] {
  return events.filter((e) => e.start <= last && (e.end ?? e.start) >= first);
}

/** Leaders save the council's feed link, which is read before it is kept; an empty link removes it. */
export async function setCouncilCalendar(troopId: string, url: string): Promise<{ saved: boolean; events?: number }> {
  const call = httpsCallable<{ troopId: string; url: string }, { saved: boolean; events?: number }>(
    functions,
    'set_council_calendar',
  );
  return (await call({ troopId, url })).data;
}
