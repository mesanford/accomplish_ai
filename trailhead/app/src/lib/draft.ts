import type { DraftResult } from './api';
import type { PathItemDoc } from './types';

export const MAX_REQUEST_CHARS = 500;

/** Drafted items as plan items: missing dates are left out rather than stored as null. */
export function draftItems(result: DraftResult): PathItemDoc[] {
  return result.items.map((i) => ({
    awardId: i.awardId,
    ...(i.plannedStart ? { plannedStart: i.plannedStart } : {}),
    ...(i.plannedEnd ? { plannedEnd: i.plannedEnd } : {}),
  }));
}

/** Adds drafted badges the plan does not already have. Existing items are never changed. */
export function addDraftItems(current: PathItemDoc[], drafted: PathItemDoc[]): PathItemDoc[] {
  const have = new Set(current.map((i) => i.awardId));
  return [...current, ...drafted.filter((i) => !have.has(i.awardId))];
}
