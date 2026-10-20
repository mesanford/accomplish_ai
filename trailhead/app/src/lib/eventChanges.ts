// Plain words for event details, matching the alert emails (functions/handlers/event_changes.py).

/** "19:30" as "7:30 pm". Anything that is not a time is returned unchanged. */
export function clockText(value: string | undefined): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
  if (!m) {
    return value ?? '';
  }
  const hour = Number(m[1]);
  return `${hour % 12 || 12}:${m[2]} ${hour < 12 ? 'am' : 'pm'}`;
}

/** The longest note a leader can add when cancelling (firestore.rules allows 200). */
export const MAX_CANCEL_NOTE = 200;

/** What a leader is told before saving, so they know who hears about it. */
export function whoHears(signupsOn: boolean): string {
  return signupsOn
    ? 'Everyone signed up is told by email and on their phones.'
    : "The troop's adults and parents are told by email and on their phones if the event is in the next two weeks.";
}
