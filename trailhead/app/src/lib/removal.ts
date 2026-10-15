/** Wording and checks for deleting a Scout's records or your own account. */

/** True when the typed text is the Scout's name, ignoring case and extra spaces. */
export function sameName(typed: string, name: string): boolean {
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return clean(name) !== '' && clean(typed) === clean(name);
}

export const CANNOT_UNDO = 'This cannot be undone.';

export const SCOUT_DELETES = [
  'Their name, birth month and year, and rank dates',
  'Their progress on ranks and merit badges, and their plan',
  'Their blue cards, including photos of paper blue cards',
  'Every sign-off made for them, and any earlier advancement you recorded',
  'Their event attendance and RSVPs, and their activity logs',
  'Their lines in Scoutbook reports',
  'Photos in your website draft that show only them. Photos on the live site that show them come down now.',
  'Their login to this troop, if they had one',
];

export const SCOUT_KEPT = [
  'Parents and their logins stay. They just no longer see this Scout.',
  'Messages already sent stay in their conversations, but this Scout is taken out of them.',
];

export const ACCOUNT_DELETES = [
  'Your sign-in and your profile',
  'Your place in each troop, including your name on the roster',
  'Your RSVPs and attendance, and your name as a website contact',
  'Your daily AI draft counts',
];

export const ACCOUNT_KEPT = [
  "Your Scouts' records stay with the troop. They belong to the troop, not to your account. To remove a Scout, ask a troop leader to use Remove from troop.",
  "Sign-offs you made stay in the Scouts' records, because they show who signed.",
  'Messages you sent stay in their conversations.',
];
