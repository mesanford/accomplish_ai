import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { SignupStatus } from './eventSignups';

// Callable wrappers for event sign-ups, permission, fees and calendar feeds.
async function call<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<In, Out>(functions, name)(data);
  return result.data;
}

interface Who {
  troopId: string;
  eventId: string;
  memberId: string;
}

export interface SignUpForm extends Who {
  answers?: Record<string, string>;
  /** A parent signing up their Scout says they give permission (needed when the event asks for it). */
  permission?: boolean;
  /** A health or emergency note only leaders can read. Parents only. */
  healthNote?: string;
}

export const signUpForEvent = (form: SignUpForm) => call<SignUpForm, { status: SignupStatus }>('sign_up_for_event', form);

export const cancelSignup = (who: Who) => call<Who, { promoted: number }>('cancel_signup', who);

export const approvePermission = (form: Who & { healthNote?: string }) =>
  call<Who & { healthNote?: string }, { status: SignupStatus }>('approve_permission', form);

export const importRsvps = (troopId: string, eventId: string) =>
  call<{ troopId: string; eventId: string }, { imported: number }>('import_rsvps', { troopId, eventId });

export const chargeEventFees = (troopId: string, eventId: string, who: 'going' | 'attendees') =>
  call<{ troopId: string; eventId: string; who: string }, { charged: number; state: 'posted' | 'pending' | null }>(
    'charge_event_fees',
    { troopId, eventId, who },
  );

export interface FeedPaths {
  path: string;
  publicPath: string | null;
}

export const getCalendarFeed = (troopId: string) => call<{ troopId: string }, FeedPaths>('get_calendar_feed', { troopId });

export const resetCalendarFeed = (troopId: string) => call<{ troopId: string }, FeedPaths>('reset_calendar_feed', { troopId });
