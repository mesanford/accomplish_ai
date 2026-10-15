/** Wording and dates for the retention schedule (the server's rules are in functions/handlers/retention.py). */

/** The same day `months` later; the 1st of the next month when that day doesn't exist (as the server counts). */
export function addMonths(day: Date, months: number): Date {
  const target = new Date(day.getFullYear(), day.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  if (day.getDate() > lastDay) {
    return new Date(target.getFullYear(), target.getMonth() + 1, 1);
  }
  return new Date(target.getFullYear(), target.getMonth(), day.getDate());
}

/** When a Scout marked as left on `leftAt` has their records deleted. */
export const scoutDeletionDate = (leftAt: Date): Date => addMonths(leftAt, 12);

export const LEFT_EXPLAINED =
  "Use this when a Scout stops coming. Their records are kept for 12 months, in case they come back or need a copy, then deleted automatically. A Scout's records are also deleted 12 months after they turn 18.";

const ACTIVITY_KEY = 'trailhead.activity.';

/** True if this browser hasn't told the server about activity in this troop today. */
export function activityDue(troopId: string, today: string, storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(ACTIVITY_KEY + troopId) !== today;
  } catch {
    return true;
  }
}

export function rememberActivity(troopId: string, today: string, storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(ACTIVITY_KEY + troopId, today);
  } catch {
    // Private windows may refuse storage; the server still writes at most once a day per troop.
  }
}

/** Today in this browser, as YYYY-MM-DD. */
export function localDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** window.localStorage, or null where reading it throws (blocked site data). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
