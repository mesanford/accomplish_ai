/** The public calendar page: upcoming events grouped by month. */

export interface CalendarEvent {
  title: string;
  start: string;
  place?: string | null;
}

/** The troop's public iCal feed of its public events, served by the `calendar_feed` function. */
export const CALENDAR_FEED_READY = true;
export const calendarFeedPath = (slug: string): string =>
  `/cal/site/${encodeURIComponent(slug)}.ics`;

/** "2026-11" for an ISO date, or null when the date is not valid. */
function monthKey(iso: string): string | null {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 7) : null;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/** Events grouped by month in date order. Events with an unreadable date are left out. */
export function groupByMonth(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of [...events].sort(
    (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  )) {
    const key = monthKey(event.start);
    if (key) {
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
  }
  return [...groups.entries()];
}

/** Whether the home page banner should show today: it has text, and its end date has not passed. */
export function bannerShows(
  banner: { text?: string; endDate?: string | null } | null | undefined,
  today: string,
): boolean {
  if (!banner?.text?.trim()) {
    return false;
  }
  return !banner.endDate || banner.endDate >= today;
}
