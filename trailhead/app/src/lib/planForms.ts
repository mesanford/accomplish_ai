// Pure helpers for the event-plan forms and screens (see plans.ts for the types they work on).
import { dollarsToCents } from './eventSignups';
import { type EventPlan, type Milestone, type PlanField, type PlanSegment, type PlanStatus, safeLink, sortMilestones } from './plans';
import type { TroopEvent } from './types';

/** A whole number from 0 to `max`; null when empty; undefined when it is not a valid number. */
export function intOrNull(text: string, max: number): number | null | undefined {
  const clean = text.trim();
  if (clean === '') {
    return null;
  }
  if (!/^\d{1,9}$/.test(clean)) {
    return undefined;
  }
  const n = Number(clean);
  return n <= max ? n : undefined;
}

/** Dollars as typed to cents; null when empty; undefined when it is not money. */
export function centsOrNull(text: string): number | null | undefined {
  if (text.trim() === '') {
    return null;
  }
  const cents = dollarsToCents(text);
  return cents === null ? undefined : cents;
}

/** One link per line. Blank lines are dropped. */
export function linksFromText(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** The first link that is not http(s), or null when they are all fine. */
export function badLink(links: string[]): string | null {
  return links.find((l) => safeLink(l) === null) ?? null;
}

export function emptySegment(): Omit<PlanSegment, 'id'> {
  return {
    start: null,
    endDate: null,
    startTime: null,
    endTime: null,
    place: '',
    logKind: 'other',
    logValues: { nights: 0, miles: 0, serviceHours: 0 },
    partC: false,
    healthConfirmed: false,
    feeCents: 0,
    signups: { enabled: false, capacity: null, needsPermission: false, deadline: null },
  };
}

/** The plan's one segment, or an empty one if it has none yet. */
export function segmentOf(plan: EventPlan): PlanSegment {
  return plan.segments?.[0] ?? { id: 's1', ...emptySegment() };
}

/** Cost per Scout, such as "$25", or "Not set". */
export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return 'Not set';
  }
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

export function minutesText(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return 'Not set';
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m} min`;
  }
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** A value from a publish difference, in words. */
export function describeField(field: PlanField, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Not set';
  }
  if (field === 'feeCents') {
    return money(Number(value));
  }
  if (field === 'logValues') {
    const v = value as { nights?: number; miles?: number; serviceHours?: number };
    return `${v.nights ?? 0} nights, ${v.miles ?? 0} miles, ${v.serviceHours ?? 0} service hours`;
  }
  if (field === 'signups') {
    const s = value as { enabled?: boolean; capacity?: number | null; deadline?: string | null };
    if (!s.enabled) {
      return 'Off';
    }
    const spots = s.capacity ? `${s.capacity} spots` : 'no limit';
    return `On, ${spots}${s.deadline ? `, sign up by ${s.deadline}` : ''}`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/** The first milestone not yet done, in date order. */
export function nextMilestone(list: Milestone[]): Milestone | null {
  return sortMilestones(list).find((m) => !m.done) ?? null;
}

/** "Jan 5 to Jan 7" style span of ISO days, or an empty string. */
export function daySpan(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) {
    return '';
  }
  return end && end !== start ? `${start} to ${end}` : start;
}

/** Members' names for a list of ids, joined with commas. */
export function namesOf(ids: string[], nameOf: (id: string) => string): string {
  return ids.map(nameOf).join(', ');
}

/** Events with no plan yet that are coming up or ended within the last 60 days (newest first). */
export function plannable(events: TroopEvent[], today: string): TroopEvent[] {
  const from = new Date(`${today}T00:00:00`);
  from.setDate(from.getDate() - 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  const cut = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  return events.filter((e) => !e.planId && !e.cancelled && e.start >= cut);
}

const STATUS_ORDER: PlanStatus[] = ['draft', 'decided', 'published', 'closed', 'cancelled'];

/** Plans by status; ones with a first day come first, soonest first. */
export function groupPlans(plans: EventPlan[]): [PlanStatus, EventPlan[]][] {
  const startOf = (p: EventPlan) => segmentOf(p).start ?? p.targetWindow?.from ?? '9999';
  return STATUS_ORDER.map((s): [PlanStatus, EventPlan[]] => [
    s,
    plans.filter((p) => p.status === s).sort((a, b) => startOf(a).localeCompare(startOf(b))),
  ]).filter(([, list]) => list.length > 0);
}

