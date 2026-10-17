import { daysBetween } from './healthForm';
import { TRAINED_ROLES } from './roles';
import type { Member } from './types';

export type YptStatus = 'current' | 'expiring' | 'lapsed' | 'missing' | 'notRequired';

export interface YptInfo {
  status: YptStatus;
  /** YYYY-MM-DD, when on file. */
  expires?: string;
}

/** Mirrors the server (functions/handlers/ypt_reminders.py): 30 days is "expiring soon", and training lapses the day
 * after its date. Only adults with a role that signs off, counsels or messages Scouts need it. */
export const YPT_SOON_DAYS = 30;

/** The date a leader typed. It is stored as 23:59 UTC that day, so the UTC date is the date they entered. */
export function yptDate(member: Pick<Member, 'yptExpiresAt'>): string | undefined {
  const at = member.yptExpiresAt?.toDate?.();
  return at ? at.toISOString().slice(0, 10) : undefined;
}

export function needsYpt(member: Pick<Member, 'kind' | 'roles' | 'leftAt'>): boolean {
  return member.kind === 'adult' && !member.leftAt && (member.roles ?? []).some((r) => TRAINED_ROLES.includes(r));
}

export function yptInfo(member: Member, today: string): YptInfo {
  const expires = yptDate(member);
  if (!needsYpt(member)) {
    return { status: 'notRequired', expires };
  }
  if (!expires) {
    return { status: 'missing' };
  }
  const left = daysBetween(today, expires);
  if (left < 0) {
    return { status: 'lapsed', expires };
  }
  return { status: left <= YPT_SOON_DAYS ? 'expiring' : 'current', expires };
}

export const YPT_TEXT: Record<YptStatus, string> = {
  current: 'YPT current',
  expiring: 'YPT expires soon',
  lapsed: 'YPT lapsed',
  missing: 'No YPT date',
  notRequired: 'YPT not needed',
};
export const YPT_TONE: Record<YptStatus, string> = {
  current: 'good',
  expiring: 'warn',
  lapsed: 'bad',
  missing: 'bad',
  notRequired: 'neutral',
};

/** Adults who need attention: lapsed, no date, or expiring within 30 days. */
export function yptAttention(members: Member[], today: string): Member[] {
  return members.filter((m) => ['lapsed', 'missing', 'expiring'].includes(yptInfo(m, today).status));
}
