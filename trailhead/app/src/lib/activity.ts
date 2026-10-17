import type { Timestamp } from 'firebase/firestore';

/** Activity credits: camping nights, service hours and hiking miles. Documents are in troops/{t}/logs and are
 * written only by the server. Totals count approved credits only; a family's entry is pending until a leader answers. */

export type ActivityKind = 'campout' | 'service' | 'hike' | 'other';
export const KIND_LABELS: Record<ActivityKind, string> = {
  campout: 'Campout',
  service: 'Service',
  hike: 'Hike',
  other: 'Other',
};
export const KINDS = Object.keys(KIND_LABELS) as ActivityKind[];

export interface ActivityEntry {
  id: string;
  scoutId: string;
  /** Credits written before kinds and statuses existed have neither; they count as approved. */
  kind?: ActivityKind;
  status?: 'approved' | 'pending' | 'rejected';
  source?: 'event' | 'manual';
  date?: string | null;
  nights?: number;
  serviceHours?: number;
  miles?: number;
  eventId?: string;
  eventTitle?: string;
  note?: string;
  eagleProject?: boolean;
  enteredByName?: string;
  createdAt?: Timestamp | null;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export interface Totals {
  nights: number;
  serviceHours: number;
  miles: number;
  /** Overnight campouts: credits with at least one night. */
  campouts: number;
}

export const EMPTY_TOTALS: Totals = { nights: 0, serviceHours: 0, miles: 0, campouts: 0 };

export const isApproved = (e: ActivityEntry): boolean => (e.status ?? 'approved') === 'approved';

const round = (n: number): number => Math.round(n * 100) / 100;

/** ISO dates (YYYY-MM-DD) compare as text. An entry with no date only counts when no range is set. */
export function inRange(date: string | null | undefined, range: DateRange = {}): boolean {
  if (!range.from && !range.to) {
    return true;
  }
  return Boolean(date) && (!range.from || (date as string) >= range.from) && (!range.to || (date as string) <= range.to);
}

export function sumEntries(entries: ActivityEntry[], range: DateRange = {}): Totals {
  const counted = entries.filter((e) => isApproved(e) && inRange(e.date, range));
  return {
    nights: counted.reduce((n, e) => n + (e.nights ?? 0), 0),
    serviceHours: round(counted.reduce((n, e) => n + (e.serviceHours ?? 0), 0)),
    miles: round(counted.reduce((n, e) => n + (e.miles ?? 0), 0)),
    campouts: counted.filter((e) => (e.nights ?? 0) > 0).length,
  };
}

export const CAMPING_BADGE_NIGHTS = 20;
/** A camp of this many nights or more is a long-term camp. */
export const LONG_TERM_NIGHTS = 6;

export interface CampingCount {
  /** Nights toward the Camping merit badge. */
  counted: number;
  /** Nights camped in all. */
  raw: number;
  /** Nights that do not count because only one long-term camp, and at most 6 of its nights, counts. */
  notCounted: number;
}

/** Camping merit badge requirement 9a: 20 nights, and only one long-term camp, up to 6 nights, may count. */
export function campingBadgeNights(entries: ActivityEntry[]): CampingCount {
  const nights = entries.filter(isApproved).map((e) => e.nights ?? 0).filter((n) => n > 0);
  const regular = nights.filter((n) => n < LONG_TERM_NIGHTS).reduce((a, b) => a + b, 0);
  const longTerm = nights.filter((n) => n >= LONG_TERM_NIGHTS);
  const counted = regular + (longTerm.length > 0 ? LONG_TERM_NIGHTS : 0);
  const raw = regular + longTerm.reduce((a, b) => a + b, 0);
  return { counted, raw, notCounted: raw - counted };
}

export interface ServiceStep {
  label: string;
  needed: number;
  have: number;
  /** When hours only count after a rank date, the words for it. */
  after?: string;
}

/** The service hour requirements the app models. Tenderfoot, Second Class and First Class need separate projects, so
 * their hours add up in turn. Star and Life count hours done as a First Class or Star Scout. */
const EARLY_STEPS: [string, number][] = [
  ['Tenderfoot 7b', 1],
  ['Second Class 8e', 2],
  ['First Class 9d', 3],
];
const LATER_STEPS: [string, number, string, string][] = [
  ['Star 4', 6, 'first-class', 'First Class'],
  ['Life 4', 6, 'star', 'Star'],
];

export function serviceSteps(entries: ActivityEntry[], rankDates: Record<string, string> = {}): ServiceStep[] {
  const approved = entries.filter(isApproved);
  const total = approved.reduce((n, e) => n + (e.serviceHours ?? 0), 0);
  let before = 0;
  const steps: ServiceStep[] = EARLY_STEPS.map(([label, needed]) => {
    const have = Math.min(needed, Math.max(0, total - before));
    before += needed;
    return { label, needed, have: round(have) };
  });
  for (const [label, needed, rankId, rankName] of LATER_STEPS) {
    const since = rankDates[rankId];
    const hours = since ? approved.filter((e) => (e.date ?? '') >= since).reduce((n, e) => n + (e.serviceHours ?? 0), 0) : 0;
    steps.push({ label, needed, have: round(Math.min(needed, hours)), after: since ? `since ${rankName}` : `after ${rankName}` });
  }
  return steps;
}

/** Hours from entries marked as an Eagle service project. */
export const eagleProjectHours = (entries: ActivityEntry[]): number =>
  round(entries.filter((e) => isApproved(e) && e.eagleProject).reduce((n, e) => n + (e.serviceHours ?? 0), 0));

export type RangePreset = 'year' | 'lastYear' | 'all';

/** The first and last day of a calendar year, or no limits. */
export function presetRange(preset: RangePreset, now: Date = new Date()): DateRange {
  const year = preset === 'lastYear' ? now.getFullYear() - 1 : now.getFullYear();
  return preset === 'all' ? {} : { from: `${year}-01-01`, to: `${year}-12-31` };
}

export interface ReportScout {
  id: string;
  name: string;
  patrolId?: string | null;
}

export interface ReportRow extends Totals {
  scoutId: string;
  name: string;
  patrolId: string | null;
}

export interface PatrolRow extends Totals {
  patrolId: string | null;
  name: string;
  scouts: number;
}

export interface TroopReport {
  rows: ReportRow[];
  patrols: PatrolRow[];
  total: Totals;
  /** Scouts with at least one service hour in the range. */
  scoutsServing: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Totals per Scout and per patrol for a date range. Credits for Scouts not on the roster are left out. */
export function troopReport(
  entries: ActivityEntry[],
  scouts: ReportScout[],
  patrolNames: Record<string, string>,
  range: DateRange = {},
): TroopReport {
  const rows = scouts
    .map((s): ReportRow => ({
      ...sumEntries(entries.filter((e) => e.scoutId === s.id), range),
      scoutId: s.id,
      name: s.name,
      patrolId: s.patrolId && patrolNames[s.patrolId] ? s.patrolId : null,
    }))
    .sort(byName);
  const add = (list: Totals[]): Totals => ({
    nights: list.reduce((n, t) => n + t.nights, 0),
    serviceHours: round(list.reduce((n, t) => n + t.serviceHours, 0)),
    miles: round(list.reduce((n, t) => n + t.miles, 0)),
    campouts: list.reduce((n, t) => n + t.campouts, 0),
  });
  const ids = [...new Set(rows.map((r) => r.patrolId))];
  const patrols = ids
    .map((id): PatrolRow => {
      const members = rows.filter((r) => r.patrolId === id);
      return { ...add(members), patrolId: id, name: id ? patrolNames[id] : 'No patrol', scouts: members.length };
    })
    .sort((a, b) => Number(a.patrolId === null) - Number(b.patrolId === null) || byName(a, b));
  return { rows, patrols, total: add(rows), scoutsServing: rows.filter((r) => r.serviceHours > 0).length };
}
