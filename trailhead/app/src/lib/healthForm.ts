import type { Timestamp } from 'firebase/firestore';

/**
 * BSA Annual Health and Medical Record: dates only, never medical details or files.
 * Parts A and B are one form; Part C (the physical) is separate. Each is good for 12 months from its date, through
 * the same day a year later. A day that does not exist a year later (29 February) counts as the last day of the month.
 */
export type PartKey = 'partsAB' | 'partC';
export type FormNeed = 'ab' | 'abc';
export type HealthStatus = 'current' | 'expiring' | 'expired' | 'missing';

export interface HealthPart {
  /** YYYY-MM-DD, the date on the form. */
  date: string;
  byMemberId: string;
  at?: Timestamp;
}

/** troops/{t}/healthForms/{memberId}. */
export interface HealthForm {
  id: string;
  partsAB?: HealthPart;
  partC?: HealthPart;
}

export const VALID_MONTHS = 12;
export const EXPIRING_DAYS = 30;
export const PART_LABELS: Record<PartKey, string> = { partsAB: 'Parts A and B', partC: 'Part C' };
export const NEED_LABELS: Record<FormNeed, string> = { ab: 'Parts A and B', abc: 'Parts A, B and C' };

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** The same day `months` later, or the last day of that month when it has no such day. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, last))}`;
}

/** The last day a form dated `iso` is valid. */
export function validThrough(iso: string): string {
  return addMonthsIso(iso, VALID_MONTHS);
}

/** Why a typed date can't be saved, or null. Not in the future, and not before 2000. */
export function dateProblem(iso: string, today: string): string | null {
  if (!DATE.test(iso) || Number.isNaN(Date.parse(iso))) {
    return 'Enter the date on the form.';
  }
  if (iso > today) {
    return 'The date can not be in the future.';
  }
  return iso < '2000-01-01' ? 'That date is too long ago.' : null;
}

/** Status today: missing, expired, expiring (within 30 days, counting the last day) or current. */
export function partStatus(part: HealthPart | undefined, today: string): HealthStatus {
  if (!part?.date) {
    return 'missing';
  }
  const left = daysBetween(today, validThrough(part.date));
  if (left < 0) {
    return 'expired';
  }
  return left <= EXPIRING_DAYS ? 'expiring' : 'current';
}

/** Status for an event: the form must still be valid on the event's last day. Only missing or expired matter. */
export function statusForEvent(part: HealthPart | undefined, eventLastDay: string): HealthStatus {
  if (!part?.date) {
    return 'missing';
  }
  return validThrough(part.date) < eventLastDay ? 'expired' : 'current';
}

export interface HealthProblem {
  part: PartKey;
  status: 'missing' | 'expired';
}

export const partsNeeded = (need: FormNeed): PartKey[] => (need === 'abc' ? ['partsAB', 'partC'] : ['partsAB']);

/** What is missing or expired for an event that needs `need`, judged on the event's last day. */
export function eventProblems(need: FormNeed, form: HealthForm | undefined, eventLastDay: string): HealthProblem[] {
  const out: HealthProblem[] = [];
  for (const part of partsNeeded(need)) {
    const status = statusForEvent(form?.[part], eventLastDay);
    if (status !== 'current' && status !== 'expiring') {
      out.push({ part, status });
    }
  }
  return out;
}

export function problemText(problems: HealthProblem[]): string {
  return problems.map((p) => `${PART_LABELS[p.part]} ${p.status === 'missing' ? 'missing' : 'expired by then'}`).join(', ');
}

export const STATUS_TEXT: Record<HealthStatus, string> = {
  current: 'current',
  expiring: 'expires soon',
  expired: 'expired',
  missing: 'missing',
};
export const STATUS_TONE: Record<HealthStatus, string> = { current: 'good', expiring: 'warn', expired: 'bad', missing: 'bad' };
