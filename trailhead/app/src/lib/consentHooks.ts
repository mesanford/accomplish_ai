import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { latestVersions, outOfDateParents, staleByScout } from './consentReview';
import { useQuery } from './hooks';
import { useTroop } from './troop';
import type { ConsentDoc } from './types';

export interface StaleScout {
  id: string;
  /** The notice version this parent last agreed to for the Scout. */
  version?: string;
}

/** The signed-in parent's Scouts whose consent is for an older notice than the current one. */
export function useParentReview(): StaleScout[] {
  const { troopId, access, actingScoutIds, parentOf } = useTroop();
  const memberId = access?.memberId ?? '';
  const ids = actingScoutIds.filter(parentOf);
  const key = ids.join(',');
  const [docs, setDocs] = useState<Record<string, ConsentDoc | null>>({});
  useEffect(() => {
    // A parent can read only their own Scouts' consent records, one document at a time.
    const stops = ids.map((id) =>
      onSnapshot(
        doc(db, `troops/${troopId}/consents/${id}`),
        (snap) => setDocs((d) => ({ ...d, [id]: snap.exists() ? ({ id, ...snap.data() } as ConsentDoc) : null })),
        () => undefined,
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [troopId, key]);
  return ids
    .filter((id) => memberId && outOfDateParents(docs[id], [memberId]).length > 0)
    .map((id) => ({ id, version: latestVersions(docs[id]).get(memberId) }));
}

/** For leaders: Scout id -> member ids of parents who have not reviewed the current notice. Empty for everyone else. */
export function useStaleScouts(): Map<string, string[]> {
  const { troopId, isLeader, members } = useTroop();
  const query = useMemo(() => (isLeader ? collection(db, `troops/${troopId}/consents`) : null), [isLeader, troopId]);
  const consents = useQuery<ConsentDoc>(query, `${troopId}/consents/${isLeader}`);
  return useMemo(() => staleByScout(consents.data, members), [consents.data, members]);
}
