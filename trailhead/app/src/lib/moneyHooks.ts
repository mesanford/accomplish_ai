import { collection, doc, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { type Campaign, settingsOf } from './campaigns';
import { db } from './firebase';
import { useDoc, useQuery } from './hooks';
import type { AccountDoc, LedgerEntry } from './ledger';
import { useTroop } from './troop';

/** Who may see what in Scout accounts. Mirrors canSeeMoney and canSeeAccount in firestore.rules. */
export function useMoneyAccess() {
  const { has, actingScoutIds, troop } = useTroop();
  const isTreasurer = has('treasurer');
  const canSeeMoney = has('treasurer', 'scoutmaster', 'advancement');
  return {
    isTreasurer,
    canSeeMoney,
    canSeeAccount: (scoutId: string) => canSeeMoney || actingScoutIds.includes(scoutId),
    settings: settingsOf(troop?.accounts),
  };
}

/** Every account's cached totals. Only for the treasurer, Scoutmaster and advancement chair. */
export function useAccounts() {
  const { troopId } = useTroop();
  const { canSeeMoney } = useMoneyAccess();
  const q = useMemo(() => (canSeeMoney ? collection(db, 'troops', troopId, 'accounts') : null), [troopId, canSeeMoney]);
  return useQuery<AccountDoc>(q, `${troopId}/accounts/${canSeeMoney}`);
}

/** One account's entries (`scoutId`), or every entry in the troop when `scoutId` is null. Sorted by the caller. */
export function useLedger(scoutId: string | null) {
  const { troopId } = useTroop();
  const { canSeeMoney, canSeeAccount } = useMoneyAccess();
  const allowed = scoutId ? canSeeAccount(scoutId) : canSeeMoney;
  const q = useMemo(() => {
    if (!allowed) {
      return null;
    }
    const ledger = collection(db, 'troops', troopId, 'ledger');
    return scoutId ? query(ledger, where('scoutId', '==', scoutId)) : ledger;
  }, [troopId, scoutId, allowed]);
  return useQuery<LedgerEntry>(q, `${troopId}/ledger/${scoutId ?? '*'}/${allowed}`);
}

export function useAccount(scoutId: string) {
  const { troopId } = useTroop();
  const { canSeeAccount } = useMoneyAccess();
  const allowed = canSeeAccount(scoutId);
  const ref = useMemo(
    () => (allowed ? doc(db, 'troops', troopId, 'accounts', scoutId) : null),
    [troopId, scoutId, allowed],
  );
  return useDoc<AccountDoc>(ref);
}

export function useCampaigns() {
  const { troopId } = useTroop();
  const { canSeeMoney } = useMoneyAccess();
  const q = useMemo(() => (canSeeMoney ? collection(db, 'troops', troopId, 'campaigns') : null), [troopId, canSeeMoney]);
  return useQuery<Campaign>(q, `${troopId}/campaigns/${canSeeMoney}`);
}

/** Scouts on the roster, by name, for pickers. Scouts marked as having left come last. */
export function useRosterScouts() {
  const { members } = useTroop();
  return useMemo(
    () =>
      members
        .filter((m) => m.kind === 'scout')
        .sort((a, b) => Number(Boolean(a.leftAt)) - Number(Boolean(b.leftAt)) || a.displayName.localeCompare(b.displayName)),
    [members],
  );
}
