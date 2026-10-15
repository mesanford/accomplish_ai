import { plural } from './plural';
import type { Role } from './types';

/** What the Home page says to a non-leader who has no Scouts linked to them, by role. */
export function noScoutsText(roles: Role[]): string {
  if (roles.includes('parent')) {
    return 'No Scout is linked to you yet. Add your Scout below, or ask a leader for an invite link.';
  }
  if (roles.includes('counselor')) {
    return 'You are not linked to any Scouts as a family member. Scouts a leader assigns to you for a merit badge are under Your merit badge Scouts.';
  }
  return 'No Scouts are linked to you yet. Ask a leader if this looks wrong.';
}

/** The leader's blue card shortcut: what it says, and whether anything is waiting. Only the Scoutmaster and the
 * advancement chair act on blue cards, so other leaders see what is waiting without being asked to act. */
export function blueCardAction(count: number, canAct = true): { text: string; waiting: boolean } {
  if (count === 0) {
    return { text: canAct ? 'No blue cards need action' : 'No blue cards are waiting', waiting: false };
  }
  if (!canAct) {
    return { text: `${plural(count, 'blue card')} waiting for the Scoutmaster or advancement chair`, waiting: false };
  }
  return { text: `${plural(count, 'blue card')} ${count === 1 ? 'needs' : 'need'} action`, waiting: true };
}
