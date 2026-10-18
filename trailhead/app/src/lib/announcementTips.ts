/**
 * What the pills on an announcement mean, shown when someone hovers, taps or focuses the pill (see TipPill).
 * A tip never repeats a pill's own words or the words of a button or checkbox beside it, so a search for that text
 * finds only the real thing. The tests enforce this.
 */

/** Pinned: feedOrder in announcements.ts puts these first. The author, a Scoutmaster or an advancement chair sets it. */
export const PINNED_TIP =
  'Kept at the top of the list, above items that are not marked this way, however recent they are. ' +
  'The author, a Scoutmaster or an advancement chair can turn this on or off.';

/** New: isUnread in announcements.ts compares when it went up with when this person last opened the list. */
export const NEW_TIP =
  'Added since the last time you opened this page, and not written by you. This is tracked for you alone, ' +
  'so other people still see their own.';

/** Newsletter: kind === 'newsletter' can have headed sections and linked troop events (both optional). */
export const NEWSLETTER_TIP =
  'An update that can have several parts, each with its own heading, and a list of upcoming troop events, ' +
  'so the dates sit with the news.';
