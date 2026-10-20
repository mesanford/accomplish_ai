// Repeating events, for the form's preview. The server makes the dates (functions/handlers/recurrence.py); these
// rules mirror it so the leader sees "Every Tuesday, 12 dates" before saving.
import type { RepeatPattern } from './eventsApi';

export const MAX_DATES = 52;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

export const REPEAT_LABELS: Record<RepeatPattern | 'none', string> = {
  none: 'Does not repeat',
  weekly: 'Every week',
  biweekly: 'Every other week',
  monthly: 'Every month, on the same weekday',
};

function parse(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

function nth(d: Date): number {
  return Math.floor((d.getUTCDate() - 1) / 7) + 1;
}

/** "Every Tuesday", "Every other Tuesday" or "The 2nd Tuesday of each month". */
export function repeatLabel(pattern: RepeatPattern, startIso: string): string {
  const d = parse(startIso);
  if (!d) {
    return '';
  }
  const day = DAYS[d.getUTCDay()];
  if (pattern === 'weekly') {
    return `Every ${day}`;
  }
  if (pattern === 'biweekly') {
    return `Every other ${day}`;
  }
  return `The ${ORDINALS[nth(d) - 1]} ${day} of each month`;
}

/** Every date of the series as YYYY-MM-DD, or [] if the dates are missing or out of order. */
export function repeatDates(pattern: RepeatPattern, startIso: string, untilIso: string): string[] {
  const first = parse(startIso);
  const until = parse(untilIso);
  if (!first || !until || until < first) {
    return [];
  }
  const out: Date[] = [];
  if (pattern === 'monthly') {
    const n = nth(first);
    for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); out.length <= MAX_DATES; m += 1) {
      const startOfMonth = new Date(Date.UTC(y, m, 1));
      if (startOfMonth > until) {
        break;
      }
      const offset = (first.getUTCDay() - startOfMonth.getUTCDay() + 7) % 7;
      const candidate = new Date(Date.UTC(y, m, 1 + offset + 7 * (n - 1)));
      if (candidate.getUTCMonth() === startOfMonth.getUTCMonth() && candidate <= until) {
        out.push(candidate);
      }
    }
  } else {
    const step = pattern === 'weekly' ? 7 : 14;
    for (let d = first; d <= until && out.length <= MAX_DATES; d = new Date(d.getTime() + step * 86400000)) {
      out.push(d);
    }
  }
  return out.map((d) => d.toISOString().slice(0, 10));
}
