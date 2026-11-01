// Plain YYYY-MM-DD date maths, done in UTC so time zones and daylight saving never shift a day.
const MS = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');

function parse(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toIso(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function makeIso(year: number, month: number, day: number): string {
  return toIso(Date.UTC(year, month - 1, day));
}

export function addDays(iso: string, n: number): string {
  return toIso(parse(iso) + n * MS);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekday(iso: string): number {
  return new Date(parse(iso)).getUTCDay();
}

/** The days from first to last, both included. Empty if last is before first. */
export function eachDay(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Sat Nov 7". */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${DAYS[weekday(iso)]} ${MONTHS[m - 1]} ${d}`;
}

/** "Sat Nov 7 – Sun Nov 8", or just the one day. */
export function rangeText(start: string, end: string | null | undefined): string {
  return end && end !== start ? `${shortDay(start)} – ${shortDay(end)}` : shortDay(start);
}

/** "Sep 5–7", "Oct 31 – Nov 1" (no weekdays; for tight rows). */
export function compactRange(start: string, end: string): string {
  const [, m1, d1] = start.split('-').map(Number);
  const [, m2, d2] = end.split('-').map(Number);
  if (start === end) {
    return `${MONTHS[m1 - 1]} ${d1}`;
  }
  return m1 === m2 ? `${MONTHS[m1 - 1]} ${d1}–${d2}` : `${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}`;
}
