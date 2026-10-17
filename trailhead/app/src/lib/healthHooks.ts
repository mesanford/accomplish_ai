import { collection, doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from './firebase';
import type { HealthForm } from './healthForm';
import { useDoc, useQuery } from './hooks';
import { useTroop } from './troop';

/** Every person's health form dates, as a map by member id. Leaders only; everyone else gets an empty map. */
export function useHealthForms(): { forms: Map<string, HealthForm>; loading: boolean } {
  const { troopId, isLeader } = useTroop();
  const q = useMemo(() => (isLeader ? collection(db, 'troops', troopId, 'healthForms') : null), [isLeader, troopId]);
  const live = useQuery<HealthForm>(q, `${troopId}/healthForms/${isLeader}`);
  return { forms: useMemo(() => new Map(live.data.map((f) => [f.id, f])), [live.data]), loading: live.loading };
}

/** One person's health form dates. `allowed` is false when this login may not read them. */
export function useHealthForm(memberId: string, allowed: boolean) {
  const { troopId } = useTroop();
  const ref = useMemo(() => (allowed ? doc(db, 'troops', troopId, 'healthForms', memberId) : null), [allowed, troopId, memberId]);
  return useDoc<HealthForm>(ref);
}
