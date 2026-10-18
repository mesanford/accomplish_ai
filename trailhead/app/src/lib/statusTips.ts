/**
 * What each required-paperwork pill means and why it matters, shown when someone hovers, taps or focuses the pill
 * (see TipPill). These never repeat a pill's own wording, so a search for the pill's text finds only the pill.
 */
import type { HealthStatus, PartKey } from './healthForm';
import type { ParentRequestStatus } from './types';
import type { YptStatus } from './ypt';

const HEALTH_PART: Record<PartKey, string> = {
  partsAB:
    'Parts A and B of the BSA Annual Health and Medical Record: health history and permission to treat, signed by a parent (or by the adult themselves). Every event that asks for a health form needs them.',
  partC:
    'Part C is the physical exam by a doctor. Events that need it, such as trips longer than 72 hours or high adventure, ask for it.',
};

const HEALTH_STATUS: Record<HealthStatus, string> = {
  current: 'The date on file is within the last 12 months. Forthright keeps only the date, never medical details.',
  expiring: 'It runs out within 30 days. Each part is good for 12 months from the date on the form.',
  expired: 'The date on file is more than 12 months old, so a new form is needed before the next event that asks for it.',
  missing: 'No date is on file yet. Record the date from the paper form on the Health forms page.',
};

export function healthTip(part: PartKey, status: HealthStatus): string {
  return `${HEALTH_PART[part]} ${HEALTH_STATUS[status]}`;
}

export const EVENT_HEALTH_TIP =
  'The BSA requires a current health form for everyone on an outing, so leaders have health history and permission to treat in an emergency. A part counts if it is still within 12 months on the last day of the event.';

const YPT_WHY =
  'Youth Protection training is the BSA course required for adults who work with Scouts, good for two years. Adults whose role signs off, counsels or messages Scouts need a current date.';

const YPT_STATUS: Record<YptStatus, string> = {
  current: 'The training date on file has not passed.',
  expiring: 'It runs out within 30 days. Retaking the course now avoids a gap.',
  lapsed:
    'The date has passed. Until a new date is added, this adult can’t be given roles that work with Scouts or post to Scouts, and the recharter flags it.',
  missing:
    'No date is on file. Without one, this adult can’t be given roles that work with Scouts or post to Scouts, and the recharter flags it.',
  notRequired: 'This adult’s roles don’t work directly with Scouts, so no date is needed.',
};

export function yptTip(status: YptStatus): string {
  return `${YPT_WHY} ${YPT_STATUS[status]}`;
}

const CONSENT_WHY =
  'The parent notice says what Forthright keeps about a Scout and who sees it. For a child under 13, US law (COPPA) requires a parent’s consent before their information is kept.';

export type ConsentTipKey = 'withdrawn' | 'given' | 'leaderConfirmed' | 'waitingOnParent' | 'noConsent' | 'noParent';

const CONSENT_STATUS: Record<ConsentTipKey, string> = {
  withdrawn: 'A parent took back their consent. A leader should remove this Scout’s records.',
  given: 'A parent said yes to it.',
  leaderConfirmed:
    'A leader recorded that the family gave permission, the way it worked before parents answered by email. A parent still needs to agree.',
  waitingOnParent: 'A parent has been asked and hasn’t answered yet.',
  noConsent: 'No parent has said yes to it for this Scout yet.',
  noParent: 'No parent of this Scout has joined the troop yet, so nobody has said yes to it. Invite one from this page.',
};

export function consentTip(key: ConsentTipKey): string {
  return `${CONSENT_WHY} ${CONSENT_STATUS[key]}`;
}

export const HELD_NEW_TIP =
  'This Scout may be under 13, so only a parent can give permission. A parent was sent a link to read the notice and say yes. Until one does, Forthright keeps only the name, and if nobody answers in 30 days the Scout and the email addresses are deleted.';

export const HELD_EXISTING_TIP =
  'This Scout has no parent consent on record, so nothing new can be saved for them until a parent agrees. Enter a parent’s email to send the request. What is already stored stays.';

export const REVIEW_TIP =
  'The parent notice changed after this Scout’s parent said yes to it. Forthright asks them to read the new version. Their earlier consent still counts, and the reminders stop once they answer.';

export const PAUSED_TIP =
  'This Scout’s parent said yes to an older notice. Later versions added kinds of information, such as activity logs or health form dates, and those stay paused for this Scout until a parent agrees to the current one. What is already stored stays.';

export const ADULT_PENDING_TIP =
  'A leader linked this adult to a Scout as their parent. Until they agree to the parent notice, they can’t see or act for that Scout.';

export const PARENT_REQUEST_TIP: Record<ParentRequestStatus, string> = {
  emailed: 'This parent was sent a link to read the parent notice and say yes. Reminders go out weekly, up to four.',
  agreed: 'This parent read the parent notice and said yes.',
  declined: 'This parent said no. They aren’t linked to the Scout and get no more messages.',
  noAnswer: 'Another parent already said yes, so this one gets no more messages.',
};
