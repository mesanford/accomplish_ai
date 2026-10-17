import { collection, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { useQuery } from './hooks';
import { useMoneyAccess } from './moneyHooks';
import { type PaymentRecord, type PaymentsMode, paymentsStatus, type TroopPayments } from './payments';
import { useTroop } from './troop';

/** The server's PAYMENTS_MODE, asked once per troop per page load. Anything that fails counts as "off". */
const asked = new Map<string, Promise<PaymentsMode>>();

function askMode(troopId: string): Promise<PaymentsMode> {
  let found = asked.get(troopId);
  if (!found) {
    found = paymentsStatus(troopId)
      .then((s) => s.mode)
      .catch(() => 'off' as const);
    asked.set(troopId, found);
  }
  return found;
}

export interface PaymentsState {
  /** Card payments are turned on for Forthright (test or live). When false, every payment screen is hidden. */
  on: boolean;
  mode: PaymentsMode;
  /** The troop has a Stripe account for this mode. */
  connected: boolean;
  /** Stripe has finished checking the account, so families can pay. */
  chargesEnabled: boolean;
  accountId: string | null;
  loading: boolean;
  /** Ask Stripe again (the treasurer, after coming back from onboarding). */
  refresh: () => Promise<void>;
}

/** Whether card payments are on for this troop. Only asks the server when it could matter: the troop has a Stripe
 * account, or this person is the treasurer who might connect one. */
export function usePayments(): PaymentsState {
  const { troopId, troop } = useTroop();
  const { isTreasurer } = useMoneyAccess();
  const saved: TroopPayments = troop?.payments ?? {};
  const relevant = isTreasurer || Boolean(saved.stripeAccountId);
  const [mode, setMode] = useState<PaymentsMode | null>(null);

  useEffect(() => {
    let live = true;
    if (!relevant) {
      setMode('off');
      return undefined;
    }
    askMode(troopId).then((m) => live && setMode(m));
    return () => {
      live = false;
    };
  }, [troopId, relevant]);

  const refresh = useCallback(async () => {
    const status = await paymentsStatus(troopId, true);
    asked.set(troopId, Promise.resolve(status.mode));
    setMode(status.mode);
  }, [troopId]);

  const on = mode === 'test' || mode === 'live';
  const matches = on && Boolean(saved.stripeAccountId) && saved.mode === mode;
  return {
    on,
    mode: mode ?? 'off',
    connected: matches,
    chargesEnabled: matches && saved.chargesEnabled === true,
    accountId: matches ? (saved.stripeAccountId ?? null) : null,
    loading: mode === null,
    refresh,
  };
}

/** Payment records for one Scout, or every payment in the troop when `scoutId` is null. Newest first. */
export function usePaymentRecords(scoutId: string | null, enabled: boolean) {
  const { troopId } = useTroop();
  const { canSeeMoney, canSeeAccount } = useMoneyAccess();
  const allowed = enabled && (scoutId ? canSeeAccount(scoutId) : canSeeMoney);
  const q = useMemo(() => {
    if (!allowed) {
      return null;
    }
    const all = collection(db, 'troops', troopId, 'payments');
    return scoutId ? query(all, where('scoutId', '==', scoutId)) : all;
  }, [troopId, scoutId, allowed]);
  const live = useQuery<PaymentRecord>(q, `${troopId}/payments/${scoutId ?? '*'}/${allowed}`);
  const sorted = useMemo(
    () => [...live.data].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
    [live.data],
  );
  return { ...live, data: sorted };
}
