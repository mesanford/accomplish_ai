import type { Timestamp } from 'firebase/firestore';

export type Audience = 'scouts' | 'adults' | 'both';
export type SignupStatus = 'going' | 'waiting_permission' | 'waitlist';

export interface SignupQuestion {
  id: string;
  label: string;
  type: 'text' | 'choice';
  required?: boolean;
  choices?: string[];
}

/** The leader's sign-up settings, stored in the event's `signups` map. */
export interface SignupSettings {
  enabled: boolean;
  audience: Audience;
  capacity?: number | null;
  /** Last day families can sign up (YYYY-MM-DD). */
  deadline?: string | null;
  needsPermission?: boolean;
  closed?: boolean;
  questions?: SignupQuestion[];
}

/** How permission was given: `app` is a parent in Forthright, `paper` is a leader recording a signed slip. */
export interface SignupPermission {
  state: 'not_needed' | 'pending' | 'approved';
  method?: 'app' | 'paper';
  byName?: string;
  at?: Timestamp;
}

/** What to say about who gave permission, or null when there is nothing to say. `day` is the date it happened. */
export function permissionText(p: SignupPermission, day = ''): string | null {
  if (p.state !== 'approved' || !p.byName) {
    return null;
  }
  const on = day ? ` on ${day}` : '';
  if (p.method === 'paper') {
    return `Paper permission slip received (recorded by ${p.byName}${on}).`;
  }
  return `Permission given by ${p.byName}${on}.`;
}

/** events/{e}/signups/{memberId}. Written only by the server. */
export interface Signup {
  id: string;
  memberId: string;
  kind: 'scout' | 'adult';
  spot: 'held' | 'waitlist';
  status: SignupStatus;
  permission: SignupPermission;
  answers: Record<string, string>;
  signedUpAt?: Timestamp;
}

export const STATUS_LABELS: Record<SignupStatus, string> = {
  going: 'Going',
  waiting_permission: 'Waiting for permission',
  waitlist: 'On the waitlist',
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  both: 'Scouts and adults',
  scouts: 'Scouts only',
  adults: 'Adults only',
};

/** Whole dollars and cents to cents. Empty means no fee. Returns null if it is not a price. */
export function dollarsToCents(text: string): number | null {
  const clean = text.trim().replace(/^\$/, '');
  if (clean === '') {
    return 0;
  }
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(clean)) {
    return null;
  }
  return Math.round(Number(clean) * 100);
}

export function formatFee(cents: number | undefined | null): string {
  if (!cents || cents <= 0) {
    return '';
  }
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function centsToDollars(cents: number | undefined | null): string {
  return cents && cents > 0 ? (cents / 100).toFixed(2).replace(/\.00$/, '') : '';
}

/** Can a family sign up now? Leaders can always add people, so this is only a hint for the form. */
export function closedReason(s: SignupSettings, eventStart: string, today: string): string {
  if (s.closed) {
    return 'Sign-ups are closed.';
  }
  if (s.deadline && today > s.deadline) {
    return 'The sign-up deadline has passed.';
  }
  return today > eventStart ? 'This event is over.' : '';
}

export function audienceAllows(audience: Audience, kind: 'scout' | 'adult'): boolean {
  return audience === 'both' || audience === (kind === 'scout' ? 'scouts' : 'adults');
}

/** "12 of 20 spots filled, 3 on the waitlist" */
export function spotsLine(held: number, capacity: number | null | undefined, waitlist: number): string {
  const spots = capacity ? `${held} of ${capacity} spots filled` : `${held} signed up`;
  return waitlist > 0 ? `${spots}, ${waitlist} on the waitlist` : spots;
}

export function newQuestionId(existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`q${n}`)) {
    n += 1;
  }
  return `q${n}`;
}

/** Turn the comma-separated choices a leader typed into a clean list. */
export function parseChoices(text: string): string[] {
  return text
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function calendarUrls(origin: string, path: string): { https: string; webcal: string } {
  const https = `${origin}${path}`;
  return { https, webcal: https.replace(/^https?:/, 'webcal:') };
}
