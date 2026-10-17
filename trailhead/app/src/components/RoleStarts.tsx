import { collection } from 'firebase/firestore';
import { useMemo } from 'react';
import { useAllCheckouts, useInventory } from '../lib/equipmentHooks';
import { db } from '../lib/firebase';
import { quartermasterChecklist, treasurerChecklist } from '../lib/guidance';
import { useQuery } from '../lib/hooks';
import { useCampaigns, useLedger } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';
import { Checklist } from './StartChecklist';

/** First steps for the treasurer: settings, a fundraiser, a charge and a payment. */
export function TreasurerStart() {
  const { troopId, troop } = useTroop();
  const ledger = useLedger(null);
  const campaigns = useCampaigns();
  if (ledger.loading || campaigns.loading) {
    return null;
  }
  const data = {
    settingsSaved: Boolean(troop?.accounts),
    fundraisers: campaigns.data.length,
    charges: ledger.data.filter((e) => e.type === 'charge').length,
    payments: ledger.data.filter((e) => e.type === 'payment').length,
  };
  return (
    <Checklist
      title="Getting started as treasurer"
      items={treasurerChecklist(`/t/${troopId}`, data)}
      dismissKey={`start.treasurer.${troopId}`}
    />
  );
}

/** First steps for the quartermaster: add gear, lend it, write a repair note. */
export function QuartermasterStart() {
  const { troopId } = useTroop();
  const inventory = useInventory();
  const checkouts = useAllCheckouts();
  const notes = useQuery<{ id: string }>(
    useMemo(() => collection(db, 'troops', troopId, 'maintenance'), [troopId]),
    `${troopId}/gs-maintenance`,
  );
  if (inventory.loading || checkouts.loading || notes.loading) {
    return null;
  }
  const data = { items: inventory.data.length, checkouts: checkouts.data.length, repairNotes: notes.data.length };
  return (
    <Checklist
      title="Getting started as quartermaster"
      items={quartermasterChecklist(`/t/${troopId}`, data)}
      dismissKey={`start.quartermaster.${troopId}`}
    />
  );
}
