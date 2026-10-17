import { describe, expect, it } from 'vitest';
import { CONSENT_NOTICE_VERSION } from '../consent';
import { CONSENT_CHANGELOG, DATA_KIND_WORDS, DATA_KINDS_ADDED, UPDATED_REASON } from '../consentChangelog';
import { blockedKinds, compareVersions, latestParentVersion } from '../consentReview';
import { mayBeUnder13 } from '../consent';
import type { ConsentDoc } from '../types';

const doc = (...versions: string[]): ConsentDoc =>
  ({ id: 's1', parentConsents: versions.map((version, i) => ({ uid: `u${i}`, memberId: `m${i}`, version })) }) as ConsentDoc;

describe('which notice version added each kind of data', () => {
  it('names a plain word for every kind, and a version that has a changelog entry', () => {
    for (const [kind, added] of Object.entries(DATA_KINDS_ADDED)) {
      expect(DATA_KIND_WORDS[kind]).toBeTruthy();
      expect(CONSENT_CHANGELOG[added]?.length).toBeGreaterThan(0);
      expect(compareVersions(added, CONSENT_NOTICE_VERSION)).toBeLessThanOrEqual(0);
    }
  });

  it('blocks only the kinds added after the notice the parents last agreed to', () => {
    expect(blockedKinds(doc('2026-10-15.3'))).toEqual(['accounts', 'activity', 'equipment', 'health', 'patrols']);
    expect(blockedKinds(doc('2026-10-16.1'))).toEqual(['activity', 'equipment', 'patrols']);
    expect(blockedKinds(doc(CONSENT_NOTICE_VERSION))).toEqual([]);
  });

  it('lets one parent on the current notice lift the block for the Scout', () => {
    expect(latestParentVersion(doc('2026-10-15.3', '2026-10-17.1'))).toBe('2026-10-17.1');
    expect(blockedKinds(doc('2026-10-15.3', '2026-10-17.1'))).toEqual([]);
  });

  it('holds nothing back when no parent consent is on record', () => {
    expect(blockedKinds(null)).toEqual([]);
    expect(blockedKinds({ id: 's1', leaderConfirmation: { uid: 'u', memberId: 'm' } } as ConsentDoc)).toEqual([]);
  });

  it('gives leaders the plain reason', () => {
    expect(UPDATED_REASON).toBe('Waiting for a parent to agree to the updated notice.');
  });
});

describe('who needs a parent to consent by email', () => {
  const today = new Date(2026, 9, 17);
  it('treats a Scout who may be under 13 as needing a parent', () => {
    expect(mayBeUnder13(2015, 3, today)).toBe(true);
    expect(mayBeUnder13(2010, 3, today)).toBe(false);
  });
});
