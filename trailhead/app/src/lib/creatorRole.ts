/** The role the person creating a troop picks. Mirrors CREATOR_ROLES in functions/handlers/membership.py. */
export type CreatorRole = 'scoutmaster' | 'leader' | 'advancement' | 'committee_chair';

export const DEFAULT_CREATOR_ROLE: CreatorRole = 'scoutmaster';

const NO_BADGES = 'You cannot change merit badge records until a Scoutmaster or advancement chair is added.';

export const CREATOR_CHOICES: { value: CreatorRole; label: string; hint: string; roles: string[] }[] = [
  {
    value: 'scoutmaster',
    label: 'Scoutmaster',
    hint: 'Manages everything in the troop, including blue cards and merit badges.',
    roles: ['leader', 'scoutmaster'],
  },
  {
    value: 'leader',
    label: 'Leader (assistant Scoutmaster)',
    hint: `Manages the troop and signs ranks. ${NO_BADGES}`,
    roles: ['leader'],
  },
  {
    value: 'advancement',
    label: 'Advancement chair',
    hint: 'Manages everything in the troop, including blue cards and merit badges.',
    roles: ['leader', 'advancement'],
  },
  {
    value: 'committee_chair',
    label: 'Committee chair',
    hint: `A committee member who can manage roles. You also get the leader role, because only leaders can give out roles. ${NO_BADGES}`,
    roles: ['leader', 'committee'],
  },
];

export function creatorHint(value: string): string {
  return CREATOR_CHOICES.find((c) => c.value === value)?.hint ?? '';
}
