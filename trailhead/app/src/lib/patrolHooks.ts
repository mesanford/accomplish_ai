import { collection } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from './firebase';
import { type Live, useQuery } from './hooks';
import { type Patrol, sortPatrols } from './patrols';
import { useTroop } from './troop';

/** The troop's patrols, by name. Everyone in the troop may read them. */
export function usePatrols(): Live<Patrol[]> {
  const { troopId } = useTroop();
  const q = useMemo(() => collection(db, `troops/${troopId}/patrols`), [troopId]);
  const live = useQuery<Patrol>(q, `${troopId}/patrols`);
  return useMemo(() => ({ ...live, data: sortPatrols(live.data) }), [live]);
}
