import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import type { Checkout, EquipmentRequest, InventoryItem, MaintenanceNote } from './equipment';
import { db } from './firebase';
import { useQuery } from './hooks';
import { useAuth } from './auth';
import { useTroop } from './troop';
import type { TroopEvent } from './types';

/** The quartermaster and the leaders manage the inventory. The quartermaster role grants nothing else. */
export function useCanManageGear(): boolean {
  const { isLeader, has } = useTroop();
  return isLeader || has('quartermaster');
}

/** The whole catalog. Every member of the troop can read it. */
export function useInventory() {
  const { troopId } = useTroop();
  const q = useMemo(() => query(collection(db, 'troops', troopId, 'inventory'), orderBy('name')), [troopId]);
  return useQuery<InventoryItem>(q, `${troopId}/inventory`);
}

/** Every loan, for the quartermaster and leaders. Everyone else gets nothing here: see `useLoansWhere`. */
export function useAllCheckouts() {
  const { troopId } = useTroop();
  const manage = useCanManageGear();
  const q = useMemo(() => (manage ? collection(db, 'troops', troopId, 'checkouts') : null), [troopId, manage]);
  return useQuery<Checkout>(q, `${troopId}/checkouts/${manage}`);
}

/** Loans to one person (`toMemberId`) or to one Scout (`scoutId`), which is what the security rules allow a
 * borrower or a parent to read. */
export function useLoansWhere(field: 'toMemberId' | 'scoutId', value: string | null) {
  const { troopId } = useTroop();
  const q = useMemo(
    () => (value ? query(collection(db, 'troops', troopId, 'checkouts'), where(field, '==', value)) : null),
    [troopId, field, value],
  );
  return useQuery<Checkout>(q, `${troopId}/checkouts/${field}/${value}`);
}

/** Requests: all of them for managers, only your own for everyone else. */
export function useRequests() {
  const { troopId } = useTroop();
  const { user } = useAuth();
  const manage = useCanManageGear();
  const uid = user?.uid ?? '';
  const q = useMemo(() => {
    const all = collection(db, 'troops', troopId, 'equipmentRequests');
    if (manage) {
      return all;
    }
    return uid ? query(all, where('requestedByUid', '==', uid)) : null;
  }, [troopId, manage, uid]);
  return useQuery<EquipmentRequest>(q, `${troopId}/equipmentRequests/${manage}/${uid}`);
}

/** An item's repair notes. Managers only. */
export function useMaintenance(itemId: string) {
  const { troopId } = useTroop();
  const manage = useCanManageGear();
  const q = useMemo(
    () => (manage ? query(collection(db, 'troops', troopId, 'maintenance'), where('itemId', '==', itemId)) : null),
    [troopId, itemId, manage],
  );
  return useQuery<MaintenanceNote>(q, `${troopId}/maintenance/${itemId}/${manage}`);
}

/** Recent and upcoming events, newest first, for choosing where gear is going. */
export function useEventChoices() {
  const { troopId } = useTroop();
  const q = useMemo(
    () => query(collection(db, 'troops', troopId, 'events'), orderBy('start', 'desc'), limit(60)),
    [troopId],
  );
  return useQuery<TroopEvent>(q, `${troopId}/events/choices`);
}
