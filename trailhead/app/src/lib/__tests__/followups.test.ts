import { describe, expect, it } from 'vitest';
import { CREATOR_CHOICES, creatorHint, DEFAULT_CREATOR_ROLE } from '../creatorRole';
import { permissionText } from '../eventSignups';

describe('troop creator role choices', () => {
  it('defaults to Scoutmaster', () => {
    expect(DEFAULT_CREATOR_ROLE).toBe('scoutmaster');
    expect(CREATOR_CHOICES[0].value).toBe('scoutmaster');
  });

  it('offers the four roles', () => {
    expect(CREATOR_CHOICES.map((c) => c.value)).toEqual(['scoutmaster', 'leader', 'advancement', 'committee_chair']);
  });

  it('gives every choice the leader role, because only leaders can give out roles', () => {
    for (const c of CREATOR_CHOICES) {
      expect(c.roles, c.value).toContain('leader');
    }
    expect(CREATOR_CHOICES.find((c) => c.value === 'committee_chair')?.roles).toEqual(['leader', 'committee']);
  });

  it('says in the hint what a choice cannot do, and why a committee chair also gets leader', () => {
    expect(creatorHint('leader')).toMatch(/cannot change merit badge records/);
    expect(creatorHint('committee_chair')).toMatch(/also get the leader role, because only leaders can give out roles/);
    expect(creatorHint('scoutmaster')).toMatch(/blue cards and merit badges/);
    expect(creatorHint('nope')).toBe('');
  });
});

describe('who gave permission', () => {
  const at = undefined;
  it('says a parent gave it in the app', () => {
    expect(permissionText({ state: 'approved', method: 'app', byName: 'Jo', at }, 'Oct 17, 2026')).toBe(
      'Permission given by Jo on Oct 17, 2026.',
    );
  });

  it('treats older records with no method as given in the app', () => {
    expect(permissionText({ state: 'approved', byName: 'Jo' })).toBe('Permission given by Jo.');
  });

  it('says a paper slip was received and who recorded it', () => {
    expect(permissionText({ state: 'approved', method: 'paper', byName: 'Pat', at }, 'Oct 17, 2026')).toBe(
      'Paper permission slip received (recorded by Pat on Oct 17, 2026).',
    );
  });

  it('says nothing while permission is pending or not needed', () => {
    expect(permissionText({ state: 'pending' })).toBeNull();
    expect(permissionText({ state: 'not_needed' })).toBeNull();
  });
});
