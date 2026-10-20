import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import type { TroopEvent } from '../../lib/types';
import { todayIso } from '../ui';

/** Events from today on, soonest first (enough for the home screen's two weeks and permission counts). */
export function useUpcoming(troopId: string): { events: TroopEvent[]; today: string; loading: boolean } {
  const today = todayIso();
  const q = useMemo(
    () => query(collection(db, `troops/${troopId}/events`), where('start', '>=', today), orderBy('start'), limit(60)),
    [troopId, today],
  );
  const live = useQuery<TroopEvent>(q, `${troopId}/upcoming/${today}`);
  return { events: live.data, today, loading: live.loading };
}
