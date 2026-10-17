import { CONSENT_NOTICE_VERSION } from './consent';
import { CONSENT_CHANGELOG, DATA_KINDS_ADDED } from './consentChangelog';
import type { ConsentDoc, Member } from './types';

/** Sort key for versions like "2026-10-17.1": the date, then the number of that day's change. Missing sorts first. */
export function versionKey(version?: string): [string, number] {
  const [day, number = ''] = (version ?? '').split('.');
  return [day, /^\d+$/.test(number) ? Number(number) : 0];
}

export function compareVersions(a?: string, b?: string): number {
  const [dayA, numA] = versionKey(a);
  const [dayB, numB] = versionKey(b);
  if (dayA !== dayB) {
    return dayA < dayB ? -1 : 1;
  }
  return numA - numB;
}

export const isOlder = (version?: string, current = CONSENT_NOTICE_VERSION) => compareVersions(version, current) < 0;

/** Each parent's (member id) newest notice version in a Scout's consent record. */
export function latestVersions(doc: ConsentDoc | null | undefined): Map<string, string | undefined> {
  const latest = new Map<string, string | undefined>();
  for (const entry of doc?.parentConsents ?? []) {
    if (!entry.memberId) {
      continue;
    }
    if (!latest.has(entry.memberId) || compareVersions(entry.version, latest.get(entry.memberId)) > 0) {
      latest.set(entry.memberId, entry.version);
    }
  }
  return latest;
}

/**
 * Member ids of the Scout's parents whose latest consent is for an older notice. Parents who never agreed are not
 * listed, nor is anyone once a parent withdrew consent. Keep equal to out_of_date_parents in the functions.
 */
export function outOfDateParents(
  doc: ConsentDoc | null | undefined,
  guardianIds: string[],
  current = CONSENT_NOTICE_VERSION,
): string[] {
  if (!doc || doc.withdrawal) {
    return [];
  }
  const latest = latestVersions(doc);
  return [...new Set(guardianIds)].filter((id) => latest.has(id) && isOlder(latest.get(id), current)).sort();
}

/** The Scouts (id -> out-of-date parent member ids) a leader should chase. Scouts who left are skipped. */
export function staleByScout(consents: ConsentDoc[], members: Member[]): Map<string, string[]> {
  const stale = new Map<string, string[]>();
  for (const scout of members) {
    if (scout.kind !== 'scout' || scout.leftAt) {
      continue;
    }
    const parents = outOfDateParents(
      consents.find((c) => c.id === scout.id),
      scout.guardianIds ?? [],
    );
    if (parents.length > 0) {
      stale.set(scout.id, parents);
    }
  }
  return stale;
}

/** What changed in the notice after `version`, up to the current one, oldest first. An unknown version gets everything. */
export function changesSince(version?: string, current = CONSENT_NOTICE_VERSION): string[] {
  return Object.keys(CONSENT_CHANGELOG)
    .filter((v) => compareVersions(v, version) > 0 && compareVersions(v, current) <= 0)
    .sort(compareVersions)
    .flatMap((v) => CONSENT_CHANGELOG[v]);
}

/** The newest notice version any parent agreed to for the Scout, or undefined if none has. */
export function latestParentVersion(doc: ConsentDoc | null | undefined): string | undefined {
  const versions = (doc?.parentConsents ?? []).filter((e) => e.memberId).map((e) => e.version);
  return versions.length === 0 ? undefined : versions.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a));
}

/** Kinds of data that must wait for this Scout: those added after the notice their parents last agreed to. */
export function blockedKinds(doc: ConsentDoc | null | undefined): string[] {
  if (!(doc?.parentConsents ?? []).some((e) => e.memberId)) {
    return [];
  }
  const latest = latestParentVersion(doc);
  return Object.entries(DATA_KINDS_ADDED)
    .filter(([, added]) => isOlder(latest, added))
    .map(([kind]) => kind)
    .sort();
}

/** The oldest of these versions, so a parent's card lists everything they have not seen. */
export function oldestVersion(versions: (string | undefined)[]): string | undefined {
  // Array.sort leaves undefined entries last whatever the comparer says, so pick the oldest by hand.
  return versions.reduce((oldest, v) => (compareVersions(v, oldest) < 0 ? v : oldest), versions[0]);
}
