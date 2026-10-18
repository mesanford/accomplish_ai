import { formatDate } from '../components/ui';
import { consentTip } from './statusTips';
import type { ConsentDoc } from './types';

/** The notice parents read before they agree. Keep it equal to CONSENT_NOTICE_VERSION in the functions. */
export const CONSENT_NOTICE_VERSION = '2026-10-18.1';

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
  /** What the status means and why it's needed (shown on hover or tap). */
  tip: string;
  tone: 'good' | 'warn' | 'bad';
  /** True when a parent has asked the troop to delete this Scout's records. */
  withdrawn: boolean;
}

const when = (at?: { toDate(): Date }) => (at ? ` ${formatDate(at.toDate().toISOString())}` : '');

/**
 * What leaders see about a Scout's consent. `hasParent`: a parent has joined the troop for this Scout.
 * `waitingOnParent`: a leader linked a parent who has not yet agreed to the notice.
 */
export function consentSummary(doc: ConsentDoc | null | undefined, hasParent: boolean, waitingOnParent = false): ConsentSummary {
  if (doc?.withdrawal) {
    return { text: 'Parent withdrew consent', tip: consentTip('withdrawn'), tone: 'bad', withdrawn: true };
  }
  const given = doc?.parentConsents?.[0];
  if (given) {
    return { text: `Parent consent: given${when(given.at)}`, tip: consentTip('given'), tone: 'good', withdrawn: false };
  }
  if (doc?.leaderConfirmation) {
    return {
      text: `Leader confirmed permission${when(doc.leaderConfirmation.at)}`,
      tip: consentTip('leaderConfirmed'),
      tone: 'warn',
      withdrawn: false,
    };
  }
  if (waitingOnParent) {
    return { text: 'Waiting for a parent to agree', tip: consentTip('waitingOnParent'), tone: 'warn', withdrawn: false };
  }
  if (hasParent) {
    return { text: 'No parent consent recorded', tip: consentTip('noConsent'), tone: 'warn', withdrawn: false };
  }
  return { text: 'Waiting for a parent to join', tip: consentTip('noParent'), tone: 'warn', withdrawn: false };
}
