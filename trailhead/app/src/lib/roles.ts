import type { Role } from './types';

/** The roles a leader can give an adult, in the order the app lists them. */
export const ADULT_ROLES: Role[] = ['leader', 'advancement', 'counselor', 'committee', 'parent'];

export const ROLE_LABELS: Record<Role, string> = {
  leader: 'Leader',
  advancement: 'Advancement chair',
  counselor: 'Merit badge counselor',
  committee: 'Committee member',
  parent: 'Parent or guardian',
  scout: 'Scout',
};

const SHORT_NAMES: Record<Role, string> = {
  leader: 'leader',
  advancement: 'advancement chair',
  counselor: 'counselor',
  committee: 'committee member',
  parent: 'parent',
  scout: 'Scout',
};

/** Roles that sign off, counsel or message Scouts, so they need current Youth Protection training. */
const TRAINED_ROLES: Role[] = ['leader', 'advancement', 'counselor', 'committee'];

const sameSet = (a: Role[], b: Role[]) => a.length === b.length && a.every((r) => b.includes(r));

/** A person's roles as a readable list, like "Leader and parent". */
export function roleList(roles: Role[] | undefined): string {
  const names = ADULT_ROLES.filter((r) => (roles ?? []).includes(r)).map((r) => SHORT_NAMES[r]);
  let text = 'no role';
  if (names.length === 1) {
    text = names[0];
  } else if (names.length > 1) {
    text = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface RoleChange {
  added: Role[];
  removed: Role[];
  changed: boolean;
}

export function roleChange(before: Role[], after: Role[]): RoleChange {
  const added = after.filter((r) => !before.includes(r));
  const removed = before.filter((r) => !after.includes(r));
  return { added, removed, changed: !sameSet(before, after) };
}

/** True if the new roles need a Youth Protection date the person does not have (or that has passed). */
export function needsTrainingDate(added: Role[], expires: Date | null | undefined, now: Date): boolean {
  return added.some((r) => TRAINED_ROLES.includes(r)) && (!expires || expires < now);
}

/** Why the form can't be sent yet, or null. `scoutIds`: the Scouts picked for a parent. */
export function rolesProblem(
  roles: Role[],
  change: RoleChange,
  scoutIds: string[],
  needsDate: boolean,
  date: string,
): string | null {
  if (roles.length === 0) {
    return 'Pick at least one role.';
  }
  if (change.added.includes('parent') && scoutIds.length === 0) {
    return 'Choose which Scouts this person is a parent of.';
  }
  if (needsDate && !date) {
    return 'Add a current Youth Protection training date.';
  }
  return null;
}

/** The notice a leader sees after saving, which says what happens next for a new parent. */
export function savedMessage(name: string, pending: number): string {
  if (pending === 0) {
    return `Saved ${name}'s roles.`;
  }
  return `Saved ${name}'s roles. ${name} will be asked to agree to the parent notice the next time they open the troop.`;
}
