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

/** The leader's blue card shortcut: what it says, and whether anything is waiting. */
export function blueCardAction(count: number): { text: string; waiting: boolean } {
  if (count === 0) {
    return { text: 'No blue cards need action', waiting: false };
  }
  return { text: `${plural(count, 'blue card')} ${count === 1 ? 'needs' : 'need'} action`, waiting: true };
}
