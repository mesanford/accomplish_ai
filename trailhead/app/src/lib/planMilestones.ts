// Milestone ordering and lateness (see plans.ts, which re-exports these).
import type { Milestone } from './plans';

/** Milestones in date order, with ones that have no date yet last. */
export function sortMilestones(list: Milestone[]): Milestone[] {
  return [...list].sort((a, b) => {
    if (a.dueOn && b.dueOn && a.dueOn !== b.dueOn) {
      return a.dueOn < b.dueOn ? -1 : 1;
    }
    if (Boolean(a.dueOn) !== Boolean(b.dueOn)) {
      return a.dueOn ? -1 : 1;
    }
    return a.order - b.order;
  });
}

export function isOverdue(m: Milestone, today: string): boolean {
  return !m.done && Boolean(m.dueOn) && (m.dueOn as string) < today;
}
