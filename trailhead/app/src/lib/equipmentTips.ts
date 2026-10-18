/**
 * What the Equipment pills mean, shown when someone hovers, taps or focuses the pill (see TipPill).
 * Like statusTips.ts, a tip never repeats a pill's own words or the words of a button beside it, so a search for a
 * pill's text finds only the pill. The tests enforce this.
 * Claims checked against components/equipment/Catalog.tsx, lib/equipment.ts, functions/handlers/equipment.py
 * (check_out_blocker, default_due) and functions/endpoints/equipment.py (request_item, decide_request).
 */
import type { ItemCondition } from './equipment';

/** Stock pill. The tone is green when all are here, amber when some are lent, red when none are left. */
export const STOCK_TIP = {
  good: 'Every one is here. None are lent to anyone.',
  warn: 'Some are lent to people or events. At least one is still here.',
  bad: 'All of them are lent right now. This changes when one comes back.',
} as const;

/** Condition pill (shown only when the item is not in good condition). */
export const CONDITION_TIP: Record<Exclude<ItemCondition, 'good'>, string> = {
  needs_repair:
    'The quartermaster or a leader marked this as needing a fix. ' +
    'It can still be lent, so look it over before you hand it to anyone.',
  retired:
    'This item is no longer in use. It cannot be lent and nobody can ask for it for an event. ' +
    'A leader or the quartermaster can change its condition on the item page to lend it again.',
};

/** Request pill. Only the quartermaster and leaders answer; a request for an event lends the item to that event. */
export const REQUEST_TIP = {
  pending:
    'Not answered yet. The quartermaster or a leader will say yes or no. Nothing is lent until they say yes.',
  approved:
    'The quartermaster or a leader said yes and lent the item to the event, ' +
    'usually until the day after the event ends.',
  declined: 'The quartermaster or a leader said no, so nothing was lent.',
} as const;

/** Late pill: the return date has passed. A loan returned on its date is not late. */
export const LATE_TIP =
  'The return date has passed and this is not back yet. Please bring it back, or ask whoever has it to. ' +
  'The quartermaster or a leader records the return when it arrives.';
