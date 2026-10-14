import { collection, doc, orderBy, query } from 'firebase/firestore';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { resolveAwardName } from './customAwards';
import { db } from './firebase';
import { useDoc, useQuery } from './hooks';
import { useTroop } from './troop';
import type { CustomAward, CustomAwardVersion } from './types';

export interface CustomAwardsState {
  awards: CustomAward[];
  byId: ReadonlyMap<string, CustomAward>;
  loading: boolean;
  /** Display name for any award id, including the troop's own awards. */
  awardName: (id: string) => string;
}

const empty: CustomAwardsState = {
  awards: [],
  byId: new Map(),
  loading: false,
  awardName: (id) => resolveAwardName(id, new Map()),
};

const CustomAwardsContext = createContext<CustomAwardsState>(empty);

/** Loads the troop's own awards once, for name lookups across the troop's pages. */
export function CustomAwardsProvider({ children }: { children: ReactNode }) {
  const { troopId, access } = useTroop();
  const member = Boolean(access);
  const q = useMemo(() => (member ? collection(db, 'troops', troopId, 'customAwards') : null), [troopId, member]);
  const live = useQuery<CustomAward>(q, `${troopId}/customAwards/${member}`);
  const value = useMemo<CustomAwardsState>(() => {
    const byId = new Map(live.data.map((a) => [a.id, a]));
    const awards = [...live.data].sort((a, b) => a.name.localeCompare(b.name));
    return { awards, byId, loading: live.loading, awardName: (id) => resolveAwardName(id, byId) };
  }, [live.data, live.loading]);
  return <CustomAwardsContext.Provider value={value}>{children}</CustomAwardsContext.Provider>;
}

export function useCustomAwards(): CustomAwardsState {
  return useContext(CustomAwardsContext);
}

/** `awardName()` that also knows the troop's own awards. Works outside a troop too (catalog only). */
export function useAwardName(): (id: string) => string {
  return useContext(CustomAwardsContext).awardName;
}

export function useCustomVersion(troopId: string, awardId: string, versionId: string | null | undefined) {
  const ref = useMemo(
    () => (versionId ? doc(db, 'troops', troopId, 'customAwards', awardId, 'versions', versionId) : null),
    [troopId, awardId, versionId],
  );
  return useDoc<CustomAwardVersion>(ref);
}

export function useCustomVersions(troopId: string, awardId: string) {
  const q = useMemo(
    () => query(collection(db, 'troops', troopId, 'customAwards', awardId, 'versions'), orderBy('createdAt', 'desc')),
    [troopId, awardId],
  );
  return useQuery<CustomAwardVersion>(q, `${troopId}/customAwards/${awardId}/versions`);
}
