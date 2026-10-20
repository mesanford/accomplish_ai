import { describe, expect, it } from 'vitest';
import { addressLine, leadershipGaps, settingsFrom, whoHolds } from '../troopSettings';
import type { Member } from '../types';

const adult = (id: string, name: string, roles: Member['roles']): Member =>
  ({ id, kind: 'adult', displayName: name, roles }) as Member;

describe('settingsFrom', () => {
  it('fills every setting, with Central and empty parts for a new troop', () => {
    const form = settingsFrom('t1', { name: 'Troop 9', unitNumber: '9' });
    expect(form.timezone).toBe('America/Chicago');
    expect(form.meetingPlace).toEqual({ place: '', street: '', city: '', state: '', zip: '' });
    expect(form.positions).toEqual({ committeeChair: null, charterRep: null });
  });

  it('keeps what was saved', () => {
    const form = settingsFrom('t1', {
      name: 'T',
      unitNumber: '1',
      timezone: 'America/Denver',
      meetingPlace: { place: 'Hall', street: '', city: 'Boise', state: 'ID', zip: '' },
      positions: { committeeChair: 'm1', charterRep: null },
    });
    expect(form.timezone).toBe('America/Denver');
    expect(form.meetingPlace.city).toBe('Boise');
    expect(form.positions.committeeChair).toBe('m1');
  });
});

describe('leadership', () => {
  const members = [
    adult('m1', 'Pat', ['leader', 'scoutmaster']),
    adult('m2', 'Alex', ['leader']),
    adult('m3', 'Sam', ['treasurer', 'parent']),
    { id: 's1', kind: 'scout', displayName: 'Riley', roles: ['scout'] } as Member,
  ];

  it('lists who holds each role, sorted by name', () => {
    const rows = whoHolds(members);
    expect(rows.find((r) => r.role === 'leader')?.names).toEqual(['Alex', 'Pat']);
    expect(rows.find((r) => r.role === 'treasurer')?.names).toEqual(['Sam']);
    expect(rows.find((r) => r.role === 'advancement')?.names).toEqual([]);
  });

  it('names what the troop is missing', () => {
    expect(leadershipGaps(members)).toEqual([]);
    expect(leadershipGaps([adult('m2', 'Alex', ['leader'])])).toHaveLength(2);
    expect(leadershipGaps([adult('m4', 'Jo', ['advancement'])])).toEqual(['No one is the Scoutmaster yet.']);
  });
});

describe('addressLine', () => {
  it('skips empty parts', () => {
    expect(addressLine({ place: 'Hall', street: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701' })).toBe(
      'Hall, 1 Main St, Springfield, IL 62701',
    );
    expect(addressLine({ city: 'Boise' })).toBe('Boise');
    expect(addressLine(undefined)).toBe('');
  });
});
