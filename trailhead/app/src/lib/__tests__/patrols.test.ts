import { describe, expect, it } from 'vitest';
import { filterByPatrol, NO_PATROL, officeOf, type Patrol, patrolMembers } from '../patrols';
import type { Member } from '../types';

const m = (id: string, patrolId?: string, kind: Member['kind'] = 'scout'): Member => ({ id, kind, displayName: id.toUpperCase(), patrolId });
const members = [m('b', 'p1'), m('a', 'p1'), m('c'), m('d', 'p2'), m('mom', undefined, 'adult')];
const patrol: Patrol = { id: 'p1', name: 'Eagles', leaderId: 'a', assistantId: 'b' };

describe('patrols', () => {
  it('lists a patrol by name and leaves out adults', () => {
    expect(patrolMembers('p1', members).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('says who leads', () => {
    expect(officeOf('a', patrol)).toBe('Patrol leader');
    expect(officeOf('b', patrol)).toBe('Assistant patrol leader');
    expect(officeOf('c', patrol)).toBe('');
    expect(officeOf('a', undefined)).toBe('');
  });

  it('filters the roster by patrol or by no patrol', () => {
    const scouts = members.filter((x) => x.kind === 'scout');
    expect(filterByPatrol(scouts, '').length).toBe(4);
    expect(filterByPatrol(scouts, 'p1').map((x) => x.id)).toEqual(['b', 'a']);
    expect(filterByPatrol(scouts, NO_PATROL).map((x) => x.id)).toEqual(['c']);
  });
});
