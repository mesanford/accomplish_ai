import type { Member } from './types';

/** troops/{t}/patrols/{id}. A Scout's patrol is `patrolId` on their member document. Written only by the server. */
export interface Patrol {
  id: string;
  name: string;
  color?: string | null;
  leaderId?: string | null;
  assistantId?: string | null;
}

/** Emblem colors a leader can pick. Each is dark enough to read next to text in light and dark themes. */
export const PATROL_COLORS: { value: string; label: string }[] = [
  { value: '#b3261e', label: 'Red' },
  { value: '#c25e00', label: 'Orange' },
  { value: '#8a6d00', label: 'Gold' },
  { value: '#2e7d32', label: 'Green' },
  { value: '#00796b', label: 'Teal' },
  { value: '#1565c0', label: 'Blue' },
  { value: '#6a3fa0', label: 'Purple' },
  { value: '#5d4037', label: 'Brown' },
];

export const colorLabel = (value: string | null | undefined): string =>
  PATROL_COLORS.find((c) => c.value === value)?.label ?? 'No color';

export const sortPatrols = (patrols: Patrol[]): Patrol[] => [...patrols].sort((a, b) => a.name.localeCompare(b.name));

/** The Scouts in a patrol, by name. */
export const patrolMembers = (patrolId: string, members: Member[]): Member[] =>
  members
    .filter((m) => m.kind === 'scout' && m.patrolId === patrolId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

/** "Patrol leader", "Assistant patrol leader" or '' for this Scout in their patrol. */
export function officeOf(scoutId: string, patrol: Patrol | undefined): string {
  if (patrol?.leaderId === scoutId) {
    return 'Patrol leader';
  }
  return patrol?.assistantId === scoutId ? 'Assistant patrol leader' : '';
}

export const NO_PATROL = 'none';

/** Roster filter: a patrol id, "none" for Scouts with no patrol, or '' for everyone. */
export function filterByPatrol(scouts: Member[], filter: string): Member[] {
  if (!filter) {
    return scouts;
  }
  return scouts.filter((s) => (filter === NO_PATROL ? !s.patrolId : s.patrolId === filter));
}
