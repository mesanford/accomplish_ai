import { formatDate } from '../components/ui';
import type { ConsentDoc } from './types';

/** The notice parents read before they agree. Keep it equal to CONSENT_NOTICE_VERSION in the functions. */
export const CONSENT_NOTICE_VERSION = '2026-10-15.3';

/** True if the Scout may still be under 13: the birth day is unknown, so assume the latest day of the month. */
export function mayBeUnder13(year: number, month: number, today: Date): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1900) {
    return false;
  }
  const [y, m] = [today.getFullYear(), today.getMonth() + 1];
  return y < year + 13 || (y === year + 13 && m < month + 1);
}

export interface ConsentSummary {
  text: string;
  tone: 'good' | 'warn' | 'bad';
  /** True when a parent has asked the troop to delete this Scout's records. */
  withdrawn: boolean;
}

const when = (at?: { toDate(): Date }) => (at ? ` ${formatDate(at.toDate().toISOString())}` : '');

/** What leaders see about a Scout's consent. `hasParent`: a parent has joined the troop for this Scout. */
export function consentSummary(doc: ConsentDoc | null | undefined, hasParent: boolean): ConsentSummary {
  if (doc?.withdrawal) {
    return { text: 'Parent withdrew consent', tone: 'bad', withdrawn: true };
  }
  const given = doc?.parentConsents?.[0];
  if (given) {
    return { text: `Parent consent: given${when(given.at)}`, tone: 'good', withdrawn: false };
  }
  if (doc?.leaderConfirmation) {
    return { text: `Leader confirmed permission${when(doc.leaderConfirmation.at)}`, tone: 'warn', withdrawn: false };
  }
  const text = hasParent ? 'No parent consent recorded' : 'Waiting for a parent to join';
  return { text, tone: 'warn', withdrawn: false };
}
