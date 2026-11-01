// The 11 US federal holidays, with the day each is observed. Pure; no network.
import { addDays, makeIso, weekday } from './isoDate';

export interface Holiday {
  /** The day it is observed (a Friday or Monday when the real day is a weekend). */
  date: string;
  /** The day itself. */
  actual: string;
  name: string;
  /** A short name for "Labor Day weekend". */
  short: string;
}

function nth(year: number, month: number, dow: number, n: number): string {
  const first = weekday(makeIso(year, month, 1));
  return makeIso(year, month, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
}

function lastOf(year: number, month: number, dow: number): string {
  const last = makeIso(year, month + 1, 0);
  return addDays(last, -((weekday(last) - dow + 7) % 7));
}

function observed(actual: string): string {
  const dow = weekday(actual);
  if (dow === 6) {
    return addDays(actual, -1);
  }
  return dow === 0 ? addDays(actual, 1) : actual;
}

/** The holidays of one year, in date order. New Year's Day may be observed on Dec 31 of the year before. */
export function federalHolidays(year: number): Holiday[] {
  const fixed = (m: number, d: number, name: string, short = name): Holiday => {
    const actual = makeIso(year, m, d);
    return { date: observed(actual), actual, name, short };
  };
  const floating = (actual: string, name: string, short = name): Holiday => ({ date: actual, actual, name, short });
  const list = [
    fixed(1, 1, "New Year's Day"),
    floating(nth(year, 1, 1, 3), 'Birthday of Martin Luther King Jr.', 'Martin Luther King Jr. Day'),
    floating(nth(year, 2, 1, 3), "Washington's Birthday", "Presidents' Day"),
    floating(lastOf(year, 5, 1), 'Memorial Day'),
    fixed(6, 19, 'Juneteenth'),
    fixed(7, 4, 'Independence Day', 'Fourth of July'),
    floating(nth(year, 9, 1, 1), 'Labor Day'),
    floating(nth(year, 10, 1, 2), 'Columbus Day'),
    fixed(11, 11, 'Veterans Day'),
    floating(nth(year, 11, 4, 4), 'Thanksgiving Day', 'Thanksgiving'),
    fixed(12, 25, 'Christmas Day', 'Christmas'),
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Holidays that can land in (or next to) the given year. */
export function holidaysAround(year: number): Holiday[] {
  return [year - 1, year, year + 1].flatMap(federalHolidays);
}

/** The holiday observed on this day, if any. */
export function holidayOn(iso: string): Holiday | undefined {
  const year = Number(iso.slice(0, 4));
  return holidaysAround(year).find((h) => h.date === iso);
}

/** The Saturday of the weekend this day belongs to (a Friday, Saturday, Sunday or Monday). */
function saturdayOf(iso: string): string | null {
  const offset: Record<number, number> = { 5: 1, 6: 0, 0: -1, 1: -2 };
  const o = offset[weekday(iso)];
  return o === undefined ? null : addDays(iso, o);
}

/** "Labor Day weekend" when an observed Friday or Monday holiday makes a 3-day weekend that includes this day. */
export function longWeekend(iso: string, holidays: Holiday[] = holidaysAround(Number(iso.slice(0, 4)))): string | null {
  const sat = saturdayOf(iso);
  if (!sat) {
    return null;
  }
  const friday = addDays(sat, -1);
  const monday = addDays(sat, 2);
  const hit = holidays.find((h) => h.date === friday || h.date === monday);
  return hit ? `${hit.short} weekend` : null;
}
