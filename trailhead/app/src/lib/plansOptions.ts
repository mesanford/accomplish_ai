// Research cards (troops/{t}/eventPlans/{p}/options/{o}) are the one thing the client writes directly. This follows
// validOption and freshAvailability in firestore.rules: availability is stamped with who set it and the server's time
// whenever it changes, and is sent back untouched when it does not.
import { addDoc, collection, deleteDoc, type DocumentData, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
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
  bookingOpens: { date: string | null; note: string } | null;
  availability: { state: Availability; note: string };
  pros: string;
  cons: string;
  notes: string;
}

const optionsPath = (troopId: string, planId: string) => `troops/${troopId}/eventPlans/${planId}/options`;

/** The fields of the form that are not availability. */
function fieldsOf(form: OptionForm) {
  const booking = form.bookingOpens;
  const hasBooking = booking && (booking.date || booking.note.trim());
  return {
    name: form.name.trim(),
    type: form.type.trim(),
    links: form.links,
    costCents: form.costCents,
    mapsUrl: form.mapsUrl.trim(),
    driveMinutes: form.driveMinutes,
    driveEstimated: form.driveEstimated && form.driveMinutes !== null,
    capacity: form.capacity,
    bookingOpens: hasBooking ? { date: booking.date || null, note: booking.note.trim() } : null,
    pros: form.pros,
    cons: form.cons,
    notes: form.notes,
  };
}

/** A new availability map. The note is left out when empty, since the rules take only the keys listed. */
function freshAvailability(memberId: string, state: Availability, note: string) {
  const out: Record<string, unknown> = { state, byMemberId: memberId, at: serverTimestamp() };
  if (note.trim()) {
    out.note = note.trim();
  }
  return out;
}

/** True when the status or its note differs from what is stored, so a new stamp is needed. */
export function availabilityChanged(old: PlanOption['availability'], state: Availability, note: string): boolean {
  return old.state !== state || (old.note ?? '') !== note.trim();
}

export async function createOption(troopId: string, planId: string, memberId: string, form: OptionForm) {
  await addDoc(collection(db, optionsPath(troopId, planId)), {
    ...fieldsOf(form),
    pinned: false,
    availability: freshAvailability(memberId, form.availability.state, form.availability.note),
    createdByMemberId: memberId,
    createdAt: serverTimestamp(),
  });
}

/** Sends only the changed fields, so createdByMemberId and createdAt are never touched. */
export async function updateOption(troopId: string, planId: string, memberId: string, old: PlanOption, form: OptionForm) {
  const changes: DocumentData = { ...fieldsOf(form) };
  if (availabilityChanged(old.availability, form.availability.state, form.availability.note)) {
    changes.availability = freshAvailability(memberId, form.availability.state, form.availability.note);
  }
  await updateDoc(doc(db, optionsPath(troopId, planId), old.id), changes);
}

/** A quick change of status from the card. */
export async function setAvailability(troopId: string, planId: string, memberId: string, option: PlanOption, state: Availability) {
  if (!availabilityChanged(option.availability, state, option.availability.note ?? '')) {
    return;
  }
  await updateDoc(doc(db, optionsPath(troopId, planId), option.id), {
    availability: freshAvailability(memberId, state, option.availability.note ?? ''),
  });
}

export async function setPinned(troopId: string, planId: string, optionId: string, pinned: boolean) {
  await updateDoc(doc(db, optionsPath(troopId, planId), optionId), { pinned });
}

export async function deleteOption(troopId: string, planId: string, optionId: string) {
  await deleteDoc(doc(db, optionsPath(troopId, planId), optionId));
}
