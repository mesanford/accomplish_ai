/** Step-by-step walkthroughs for each kind of person using Forthright, shown on the Help page. The text for each
 * guide lives in lib/guides/, one file per role. */
import { COMMITTEE_GUIDE } from './guides/committee';
import { COUNSELOR_GUIDE } from './guides/counselor';
import { EVERYONE_GUIDE } from './guides/everyone';
import { PARENT_GUIDE, SCOUT_GUIDE } from './guides/family';
import { LEADER_GUIDE } from './guides/leader';
import { QUARTERMASTER_GUIDE } from './guides/quartermaster';
import { TREASURER_GUIDE } from './guides/treasurer';
import type { Role } from './types';

export type { GuideTask, RoleGuide } from './guides/types';

export const ROLE_GUIDES = [
  LEADER_GUIDE,
  TREASURER_GUIDE,
  QUARTERMASTER_GUIDE,
  COMMITTEE_GUIDE,
  PARENT_GUIDE,
  SCOUT_GUIDE,
  COUNSELOR_GUIDE,
  EVERYONE_GUIDE,
];

/** The guides to open for a person: one for each kind of role they hold. A Scoutmaster and an advancement chair
 * use the leader guide. "For everyone" stays closed until opened. */
export function guidesToOpen(isLeader: boolean, has: (role: Role) => boolean): string[] {
  const mine: [string, boolean][] = [
    ['leader', isLeader],
    ['treasurer', has('treasurer')],
    ['quartermaster', has('quartermaster')],
    ['committee', has('committee')],
    ['parent', has('parent')],
    ['scout', has('scout')],
    ['counselor', has('counselor')],
  ];
  return mine.filter(([, on]) => on).map(([id]) => id);
}
