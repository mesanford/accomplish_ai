/**
 * What more of the status pills mean, shown when someone hovers, taps or focuses the pill (see TipPill).
 * Like statusTips.ts, a tip never repeats a pill's own words or the words of a pill beside it, so a search for a
 * pill's text finds only the pill. The tests enforce this.
 */
import type { SignupStatus } from './eventSignups';
import type { ConsentState } from './site';
import type { Visibility } from './siteDocs';
import type { CardStatus, Feasibility } from './types';

/** Blue card: what the status means and who acts next. */
export const CARD_TIP: Record<CardStatus, string> = {
  requested:
    'Someone asked for this badge for the Scout. A leader who looks after badges reads the ask next, and says yes or no.',
  approved: 'A leader said yes. Next, a leader picks the merit badge counselor who will work with the Scout.',
  counselor_assigned:
    'A counselor has been picked. The counselor starts working with the Scout when they are both ready.',
  in_progress:
    'The Scout is working on the badge with the counselor, who marks each step as done. When the steps are met, ' +
    'the counselor marks the whole badge finished. For a counselor outside the troop, a leader does this.',
  complete: 'The badge is finished and the Scout has earned it. Nothing more is needed.',
  cancelled: 'A leader called this off, so nobody needs to do anything more for it.',
};

/** Path plan check: the rule is in functions/trailhead_core/feasibility.py (a problem makes it fail, a warning flags it). */
export const PATH_TIP: Record<Feasibility['status'], string> = {
  ok: 'Forthright found nothing wrong with this plan. The dates, required badges and age limits all fit.',
  at_risk: 'The plan can still work, but Forthright found something worth a look. The notes below say what.',
  infeasible:
    'Something in the plan cannot work as written, such as a date that is too late or a badge that needs more ' +
    'time. The notes below say what to change.',
};

export type RequirementTipKey = 'signed' | 'ready' | 'review';

/** A step of a rank, badge or troop award. */
export const REQUIREMENT_TIP: Record<RequirementTipKey, string> = {
  signed: 'A leader or counselor confirmed the Scout did this, and it is recorded. It counts toward the award.',
  ready:
    'The Scout was at an event linked to this step. It is lined up for a leader to confirm, but it does not count ' +
    'until a leader does.',
  review:
    'The wording of this step changed after the Scout started. A leader needs to check the updated wording and ' +
    'confirm it again.',
};

export const AWARD_FINISHED_TIP =
  'Every step of this troop award is confirmed. The date is the day the last one was.';

/** An activity credit (camping nights, service hours, miles) that is not yet counted in the totals. */
export const ACTIVITY_TIP: Record<'pending' | 'rejected', string> = {
  pending:
    'A family or Scout added this. A leader has to look at it before the nights, hours or miles go into the totals.',
  rejected: 'A leader looked at this and said no, so it is not counted in the Scout’s totals.',
};

/** Event sign-up. A person who still needs a parent’s yes keeps their spot. People are emailed when a spot opens. */
export const SIGNUP_TIP: Record<SignupStatus, string> = {
  going: 'This person has a spot and nothing is holding it up.',
  waiting_permission:
    'This person has a spot saved, but a parent still has to say yes first. A leader can instead record a paper slip.',
  waitlist:
    'The event is full, so this person is in line. When a spot opens, whoever has been in line longest moves up and ' +
    'an email is sent.',
};

export const EAGLE_REQUIRED_TIP =
  'A Scout must earn this badge to reach the Eagle rank, the highest rank in Scouts BSA.';

export const EAGLE_GROUP_TIP =
  'For the Eagle rank, a Scout must earn one badge from this short list of choices. Any one of them counts, ' +
  'and earning more than one does not count extra.';

export const DISCONTINUED_TIP =
  'Scouts BSA no longer offers this badge. Only Scouts who already started it may still earn it, and they must ' +
  'be done by the date shown. A plan that runs past that date is flagged as a problem.';

/** Whether photos showing a Scout can go on the troop’s public website. A photo needs a yes for every Scout in it. */
export const PHOTO_TIP: Record<ConsentState, string> = {
  granted:
    'A parent or leader said yes to photos of this Scout on the public website. Their name is never shown. A photo ' +
    'with other Scouts in it also needs a yes for each of them.',
  withdrawn:
    'A parent or leader said no. Photos showing this Scout stay off the public website, and any that were there ' +
    'were taken down.',
  none:
    'Nobody has answered yet, so photos showing this Scout are left off the public website. A photo with other ' +
    'Scouts in it stays off until every one of them has a yes.',
};

/** Who can open a document in the library. */
export const DOCUMENT_TIP: Record<Visibility, string> = {
  public:
    'Once the troop website is published, anyone on the internet can open this file, with no sign-in. Troop ' +
    'members can open it in the app too. Medical forms can never be shared this way.',
  members: 'Anyone in the troop who uses the app can open this file. People outside the troop can’t.',
  leaders: 'Only troop leaders can open this file. Other people in the troop can’t see it.',
};

/** On every download button: what the file is and what opens it. */
export const SPREADSHEET_TIP = 'Saves a spreadsheet file (CSV) that opens in Excel, Google Sheets or Numbers.';
