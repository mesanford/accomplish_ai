import { collection, orderBy, query } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from './firebase';
import { useQuery } from './hooks';
import { useTroop } from './troop';
import type { JoinRequest } from './types';

/** People who found the troop on the create form and asked to join, oldest first. Leaders only; empty for others. */
export function useJoinRequests(): JoinRequest[] {
  const { troopId, isLeader } = useTroop();
  const q = useMemo(
    () => (isLeader ? query(collection(db, 'troops', troopId, 'joinRequests'), orderBy('requestedAt')) : null),
    [troopId, isLeader],
  );
  return useQuery<JoinRequest>(q, `${troopId}/joinRequests/${isLeader}`).data;
}
