// Which days are booked, maybe or open, for the "year at a glance" calendar. Pure.
import type { Holiday } from './holidays';
import { longWeekend } from './holidays';
import { addDays, eachDay, weekday } from './isoDate';
import type { EventPlan } from './plans';
import type { TroopEvent } from './types';

export type Status = 'booked' | 'maybe' | 'open';

export interface Entry {
  kind: 'booked' | 'maybe';
  label: string;
  eventId?: string;
  planId?: string;
}

export interface DayInfo {
  iso: string;
  /** Booked beats maybe. "open" is only given to weekend days; other free days are null. */
  status: Status | null;
  entries: Entry[];
  holiday?: string;
}

export interface WeekendInfo {
  sat: string;
  sun: string;
  status: Status;
  entries: Entry[];
  /** A holiday on the weekend, or the long weekend's name. */
  holiday?: string;
}

function span(start: string | null | undefined, end: string | null | undefined): [string, string] | null {
  if (!start) {
    return null;
  }
  return [start, end && end > start ? end : start];
}

/** The days a plan might use: its segment dates, else its target window. */
export function planSpan(plan: EventPlan): [string, string] | null {
  const seg = plan.segments?.[0];
  return span(seg?.start, seg?.endDate) ?? span(plan.targetWindow?.from, plan.targetWindow?.to);
}

/** Every day from `from` to `to` (YYYY-MM-DD) with its status. */
export function buildDays(
  events: TroopEvent[],
  plans: EventPlan[],
  from: string,
  to: string,
  holidays: Holiday[],
): Map<string, DayInfo> {
  const days = new Map<string, DayInfo>();
  const names = new Map(holidays.map((h) => [h.date, h.name]));
  for (const iso of eachDay(from, to)) {
    days.set(iso, { iso, status: null, entries: [], holiday: names.get(iso) });
  }
  const add = (range: [string, string] | null, entry: Entry) => {
    if (!range) {
      return;
    }
    for (const iso of eachDay(range[0] < from ? from : range[0], range[1] > to ? to : range[1])) {
      const day = days.get(iso);
      if (day) {
        day.entries.push(entry);
        day.status = entry.kind === 'booked' || day.status === 'booked' ? 'booked' : 'maybe';
      }
    }
  };
  for (const ev of events) {
    if (!ev.cancelled) {
      add(span(ev.start, ev.endDate), { kind: 'booked', label: ev.title, eventId: ev.id });
    }
  }
  for (const plan of plans) {
    if (plan.status === 'draft' || plan.status === 'decided') {
      add(planSpan(plan), { kind: 'maybe', label: plan.title, planId: plan.id });
    }
  }
  for (const day of days.values()) {
    if (day.status === null && (weekday(day.iso) === 6 || weekday(day.iso) === 0)) {
      day.status = 'open';
    }
  }
  return days;
}

/** Each Saturday-and-Sunday pair whose Saturday is between `from` and `to`. */
export function buildWeekends(days: Map<string, DayInfo>, from: string, to: string, holidays: Holiday[]): WeekendInfo[] {
  const out: WeekendInfo[] = [];
  for (const sat of eachDay(from, to).filter((d) => weekday(d) === 6)) {
    const sun = addDays(sat, 1);
    const parts = [days.get(sat), days.get(sun)];
    const entries = parts.flatMap((d) => d?.entries ?? []).filter((e, i, all) => all.findIndex((x) => x.label === e.label && x.kind === e.kind) === i);
    const booked = entries.some((e) => e.kind === 'booked');
    let status: Status = 'open';
    if (booked) {
      status = 'booked';
    } else if (entries.length > 0) {
      status = 'maybe';
    }
    const holiday = longWeekend(sat, holidays) ?? parts.find((d) => d?.holiday)?.holiday;
    out.push({ sat, sun, status, entries, holiday });
  }
  return out;
}
