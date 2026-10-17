import { describe, expect, it } from 'vitest';
import { CONSENT_NOTICE_VERSION } from '../consent';
import { CONSENT_CHANGELOG } from '../consentChangelog';
import {
  changesSince,
  compareVersions,
  isOlder,
  latestVersions,
  oldestVersion,
  outOfDateParents,
  staleByScout,
} from '../consentReview';
import type { ConsentDoc, Member } from '../types';

const entry = (memberId: string, version?: string) =>
  ({ uid: `u-${memberId}`, memberId, version }) as never;
const doc = (extra: Partial<ConsentDoc>): ConsentDoc => ({ id: 's1', ...extra });
const scout = (id: string, extra: Partial<Member> = {}) =>
  ({ id, kind: 'scout', displayName: id, ...extra }) as Member;

describe('versions', () => {
  it('sort by date, then by the number of that day', () => {
    expect(compareVersions('2026-10-15', '2026-10-15.2')).toBeLessThan(0);
    expect(compareVersions('2026-10-15.9', '2026-10-15.10')).toBeLessThan(0);
    expect(compareVersions('2026-10-17.1', '2026-10-16.1')).toBeGreaterThan(0);
    expect(compareVersions('2026-10-17.1', '2026-10-17.1')).toBe(0);
    expect(isOlder(undefined)).toBe(true);
  });
});

describe('out-of-date detection', () => {
  it("takes each parent's highest version", () => {
    const latest = latestVersions(
      doc({ parentConsents: [entry('mom', '2026-10-15.3'), entry('mom', CONSENT_NOTICE_VERSION)] }),
    );
    expect(latest.get('mom')).toBe(CONSENT_NOTICE_VERSION);
  });

  it('lists parents whose latest consent is older', () => {
    const consent = doc({
      parentConsents: [
        entry('mom', '2026-10-16.1'),
        entry('dad', CONSENT_NOTICE_VERSION),
        entry('gone', '2026-10-15'),
      ],
    });
    expect(outOfDateParents(consent, ['mom', 'dad'])).toEqual(['mom']);
  });

  it('stops listing a parent who agreed again, and anyone after a withdrawal', () => {
    const old = entry('mom', '2026-10-16.1');
    expect(
      outOfDateParents(doc({ parentConsents: [old, entry('mom', CONSENT_NOTICE_VERSION)] }), [
        'mom',
      ]),
    ).toEqual([]);
    expect(
      outOfDateParents(doc({ parentConsents: [old], withdrawal: { uid: 'u', memberId: 'mom' } }), [
        'mom',
      ]),
    ).toEqual([]);
    expect(outOfDateParents(null, ['mom'])).toEqual([]);
  });

  it('finds the Scouts a leader should chase, skipping Scouts who left', () => {
    const consents = [
      doc({ id: 's1', parentConsents: [entry('mom', '2026-10-16.1')] }),
      doc({ id: 's2', parentConsents: [entry('dad', CONSENT_NOTICE_VERSION)] }),
      doc({ id: 's3', parentConsents: [entry('mom', '2026-10-16.1')] }),
    ];
    const members = [
      scout('s1', { guardianIds: ['mom'] }),
      scout('s2', { guardianIds: ['dad'] }),
      scout('s3', { guardianIds: ['mom'], leftAt: {} as never }),
    ];
    expect([...staleByScout(consents, members)]).toEqual([['s1', ['mom']]]);
  });
});

describe('the changelog', () => {
  it('has an entry for the current notice version, so nobody is asked to review nothing', () => {
    expect(CONSENT_CHANGELOG[CONSENT_NOTICE_VERSION]?.length).toBeGreaterThan(0);
  });

  it('only has versions that are not newer than the current one, each with plain sentences', () => {
    for (const [version, lines] of Object.entries(CONSENT_CHANGELOG)) {
      expect(compareVersions(version, CONSENT_NOTICE_VERSION)).toBeLessThanOrEqual(0);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.trim()).toBe(line);
        expect(line.endsWith('.')).toBe(true);
      }
    }
  });

  it('lists only what is new since the version a parent agreed to', () => {
    expect(changesSince(CONSENT_NOTICE_VERSION)).toEqual([]);
    expect(changesSince('2026-10-16.1')).toEqual([
      ...CONSENT_CHANGELOG['2026-10-17.1'],
      ...CONSENT_CHANGELOG['2026-10-18.1'],
    ]);
    expect(changesSince('2026-10-15.3')).toEqual([
      ...CONSENT_CHANGELOG['2026-10-16.1'],
      ...CONSENT_CHANGELOG['2026-10-17.1'],
      ...CONSENT_CHANGELOG['2026-10-18.1'],
    ]);
  });

  it('gives everything to a parent whose version is unknown or the first', () => {
    const all = Object.values(CONSENT_CHANGELOG).flat();
    expect(changesSince('2026-10-15')).toEqual(all);
    expect(changesSince(undefined)).toEqual(all);
  });

  it('starts from the oldest version among several Scouts', () => {
    expect(oldestVersion(['2026-10-16.1', '2026-10-15.3', undefined])).toBeUndefined();
    expect(oldestVersion(['2026-10-16.1', '2026-10-15.3'])).toBe('2026-10-15.3');
  });
});
