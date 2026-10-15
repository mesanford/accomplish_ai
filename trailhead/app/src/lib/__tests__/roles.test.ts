import { describe, expect, it } from 'vitest';
import { consentSummary } from '../consent';
import { needsTrainingDate, parentLine, pendingLinks, roleChange, roleList, rolesProblem, savedMessage } from '../roles';
import type { Access } from '../types';

const now = new Date(2026, 9, 15);

describe('roleList', () => {
  it('lists several roles in the app order', () => {
    expect(roleList(['parent', 'leader'])).toBe('Leader and parent');
    expect(roleList(['counselor', 'committee', 'parent'])).toBe('Counselor, committee member and parent');
    expect(roleList(['leader'])).toBe('Leader');
    expect(roleList(['advancement', 'scoutmaster', 'leader'])).toBe('Leader, Scoutmaster and advancement chair');
    expect(roleList(undefined)).toBe('No role');
  });
});

describe('roleChange', () => {
  it('finds what was added and removed', () => {
    expect(roleChange(['leader'], ['leader', 'parent'])).toEqual({ added: ['parent'], removed: [], changed: true });
    expect(roleChange(['leader', 'parent'], ['parent'])).toEqual({ added: [], removed: ['leader'], changed: true });
    expect(roleChange(['leader', 'parent'], ['parent', 'leader']).changed).toBe(false);
  });
});

describe('needsTrainingDate', () => {
  const future = new Date(2027, 0, 1);
  const past = new Date(2026, 0, 1);

  it('asks for a date when a trained role is added and there is no current one', () => {
    expect(needsTrainingDate(['counselor'], null, now)).toBe(true);
    expect(needsTrainingDate(['leader'], past, now)).toBe(true);
    expect(needsTrainingDate(['scoutmaster'], null, now)).toBe(true);
  });

  it('does not ask when the date is current or the role needs no training', () => {
    expect(needsTrainingDate(['leader'], future, now)).toBe(false);
    expect(needsTrainingDate(['parent'], null, now)).toBe(false);
    expect(needsTrainingDate([], null, now)).toBe(false);
  });
});

describe('rolesProblem', () => {
  const add = roleChange(['committee'], ['committee', 'parent']);

  it('needs a role, Scouts for a new parent, and a date when one is required', () => {
    expect(rolesProblem([], roleChange(['leader'], []), [], false, '')).toBe('Pick at least one role.');
    expect(rolesProblem(['committee', 'parent'], add, [], false, '')).toBe('Choose which Scouts this person is a parent of.');
    expect(rolesProblem(['leader'], roleChange([], ['leader']), [], true, '')).toBe('Add a current Youth Protection training date.');
    expect(rolesProblem(['committee', 'parent'], add, ['s1'], false, '')).toBeNull();
  });
});

describe('savedMessage', () => {
  it('tells the leader when a parent still has to agree', () => {
    expect(savedMessage('Pat', 0)).toBe("Saved Pat's roles.");
    expect(savedMessage('Pat', 1)).toMatch(/Pat will be asked to agree to the parent notice/);
  });
});

describe('consentSummary while a parent has not agreed', () => {
  it('says the troop is waiting on the parent', () => {
    expect(consentSummary(null, true, true)).toMatchObject({ text: 'Waiting for a parent to agree', tone: 'warn' });
  });

  it('prefers a consent that was given', () => {
    const given = { id: 's1', parentConsents: [{ uid: 'u', memberId: 'm', version: 'v' }] };
    expect(consentSummary(given, true, true).tone).toBe('good');
  });
});

describe('pending parent links', () => {
  const access = (memberId: string, pending?: string[]) => ({ memberId, roles: ['parent'], scoutIds: pending ?? [], consentPendingScoutIds: pending }) as unknown as Access;

  it('lists only parents still waiting to agree', () => {
    const links = pendingLinks([access('m1', ['s1']), access('m2'), access('m3', [])]);
    expect([...links]).toEqual([['m1', ['s1']]]);
  });

  it('marks waiting parents on a Scout row and says when there are none', () => {
    const name = (id: string) => ({ m1: 'Jordan Lee', m2: 'Pat Kim' })[id] ?? id;
    expect(parentLine(['m1'], ['m2'], name)).toBe('Parents: Jordan Lee, Pat Kim (waiting to agree)');
    expect(parentLine([], [], name)).toBe('No parent on the app yet');
  });
});
