// Research cards (troops/{t}/eventPlans/{p}/options/{o}). Only the plan_action function writes them, for adults and
// Scouts alike, so each card is checked, consent is checked for Scouts, and availability is stamped with who set it
// and the server's time whenever it changes (functions/endpoints/plans_options.py).
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { Amenity } from './planBrief';
import type { Availability, PlanOption } from './plans';

/** What the research form edits. */
export interface OptionForm {
  name: string;
  type: string;
  links: string[];
  costCents: number | null;
  mapsUrl: string;
  driveMinutes: number | null;
  driveEstimated: boolean;
  capacity: number | null;
  amenities: Amenity[];
  bookingOpens: { date: string | null; note: string } | null;
  availability: { state: Availability; note: string };
  pros: string;
  cons: string;
  notes: string;
}

async function act(troopId: string, planId: string, op: string, data: Record<string, unknown>) {
  await httpsCallable(functions, 'plan_action')({ troopId, planId, op, ...data });
}

/** The form as the server reads it. */
function sent(form: OptionForm) {
  return { ...form, mapsUrl: form.mapsUrl.trim(), driveEstimated: form.driveEstimated && form.driveMinutes !== null };
}

/** True when the status or its note differs from what is stored, so a new stamp is needed. */
export function availabilityChanged(old: PlanOption['availability'], state: Availability, note: string): boolean {
  return old.state !== state || (old.note ?? '') !== note.trim();
}

/** `_memberId` is kept for callers; the server stamps the card with the signed-in person. */
export async function createOption(troopId: string, planId: string, _memberId: string, form: OptionForm) {
  await act(troopId, planId, 'save_option', { option: sent(form) });
}

export async function updateOption(troopId: string, planId: string, _memberId: string, old: PlanOption, form: OptionForm) {
  await act(troopId, planId, 'save_option', { optionId: old.id, option: sent(form) });
}

/** A quick change of status from the card. */
export async function setAvailability(
  troopId: string,
  planId: string,
  _memberId: string,
  option: PlanOption,
  state: Availability,
) {
  if (!availabilityChanged(option.availability, state, option.availability.note ?? '')) {
    return;
  }
  await act(troopId, planId, 'set_availability', { optionId: option.id, state });
}

export async function setPinned(troopId: string, planId: string, optionId: string, pinned: boolean) {
  await act(troopId, planId, 'pin_option', { optionId, pinned });
}

export async function setLiked(troopId: string, planId: string, optionId: string, like: boolean) {
  await act(troopId, planId, 'like_option', { optionId, like });
}

export async function deleteOption(troopId: string, planId: string, optionId: string) {
  await act(troopId, planId, 'delete_option', { optionId });
}
