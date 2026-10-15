import { collection, doc } from 'firebase/firestore';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import { recordActivity } from './api';
import { useAuth } from './auth';
import { db } from './firebase';
import { useDoc, useQuery } from './hooks';
import { activityDue, browserStorage, localDay, rememberActivity } from './retention';
import type { Access, Member, Role, Troop } from './types';

export interface TroopState {
  troopId: string;
  troop: Troop | null;
  access: Access | null;
  members: Member[];
  loading: boolean;
  /** Ids of the Scouts this person can see: all for leaders, their own or their children otherwise. */
  visibleScoutIds: string[];
  has: (...roles: Role[]) => boolean;
  isLeader: boolean;
  /** True if this person is a parent of the Scout and has agreed to the consent notice for them. */
  parentOf: (scoutId: string) => boolean;
  memberName: (memberId: string) => string;
  uidName: (uid: string | undefined) => string;
}

const TroopContext = createContext<TroopState | null>(null);

export function TroopProvider({ troopId, children }: { troopId: string; children: ReactNode }) {
  const { user } = useAuth();
  const troopRef = useMemo(() => doc(db, 'troops', troopId), [troopId]);
  const accessRef = useMemo(() => (user ? doc(db, 'troops', troopId, 'access', user.uid) : null), [troopId, user]);
  const troop = useDoc<Troop>(troopRef);
  const access = useDoc<Access>(accessRef);
  const membersQuery = useMemo(() => (access.data ? collection(db, 'troops', troopId, 'members') : null), [troopId, access.data]);
  const members = useQuery<Member>(membersQuery, `${troopId}/members/${Boolean(access.data)}`);
  const isMember = Boolean(access.data);

  // Tell the server the troop is in use (at most once a day per browser), so it isn't deleted as inactive.
  useEffect(() => {
    const today = localDay();
    const storage = browserStorage();
    if (!isMember || !activityDue(troopId, today, storage)) {
      return;
    }
    recordActivity(troopId)
      .then(() => rememberActivity(troopId, today, storage))
      .catch(() => undefined); // best effort: it is tried again next time the troop opens
  }, [troopId, isMember]);

  const value = useMemo<TroopState>(() => {
    const roles = new Set(access.data?.roles ?? []);
    const has = (...wanted: Role[]) => wanted.some((r) => roles.has(r));
    const isLeader = has('leader', 'advancement');
    const pending = new Set(access.data?.consentPendingScoutIds ?? []);
    const parentOf = (scoutId: string) => roles.has('parent') && (access.data?.scoutIds ?? []).includes(scoutId) && !pending.has(scoutId);
    const byId = new Map(members.data.map((m) => [m.id, m]));
    const byUid = new Map(members.data.filter((m) => m.uid).map((m) => [m.uid as string, m]));
    const scouts = members.data.filter((m) => m.kind === 'scout').map((m) => m.id);
    return {
      troopId,
      troop: troop.data,
      access: access.data,
      members: members.data,
      loading: troop.loading || access.loading || members.loading,
      visibleScoutIds: isLeader ? scouts : (access.data?.scoutIds ?? []).filter((id) => !pending.has(id)),
      has,
      isLeader,
      parentOf,
      memberName: (id) => byId.get(id)?.displayName ?? 'Unknown member',
      uidName: (uid) => (uid ? (byUid.get(uid)?.displayName ?? 'Unknown member') : 'Not assigned'),
    };
  }, [troopId, troop.data, troop.loading, access.data, access.loading, members.data, members.loading]);

  return <TroopContext.Provider value={value}>{children}</TroopContext.Provider>;
}

export function useTroop(): TroopState {
  const value = useContext(TroopContext);
  if (!value) {
    throw new Error('useTroop must be used inside a TroopProvider');
  }
  return value;
}
