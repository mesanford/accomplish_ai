import type { Timestamp } from 'firebase/firestore';

/** Scout accounts, as the server writes them (functions/handlers/ledger.py has the rules and the math). */

export type EntryType = 'sale' | 'charge' | 'payment' | 'adjustment' | 'transfer';
export type PayMethod = 'cash' | 'check' | 'other' | 'credit';

/** troops/{t}/ledger/{id}. Credit is positive, a charge negative, in whole cents. Never edited by a person. */
export interface LedgerEntry {
  id: string;
  scoutId: string;
  type: EntryType;
  amountCents: number;
  description: string;
  date: string;
  /** A charge paid from account credit when it was posted. Otherwise it stays open until paid. */
  fromCredit?: boolean;
  method?: PayMethod;
  /** Open charge id to the cents this payment put toward it. */
  covers?: Record<string, number>;
  /** A payment from account credit: how much credit it used. */
  appliedCents?: number;
  reverses?: string;
  reason?: string;
  campaignId?: string;
  eventId?: string;
  transferId?: string;
  broughtForward?: boolean;
  replaces?: string[];
  anonymized?: boolean;
  scoutRef?: string;
  createdBy: string;
  createdByName: string;
  createdAt?: Timestamp;
}

/** troops/{t}/accounts/{scoutId}: totals the server recomputes from every entry on each post. */
export interface AccountDoc {
  id: string;
  scoutId: string;
  balanceCents: number;
  openChargesCents: number;
  openChargeCount: number;
  entryCount: number;
  scoutRef?: string;
  updatedAt?: Timestamp;
}

export const GENERAL_FUND = 'troop-fund';
export const isFormer = (accountId: string) => accountId.startsWith('former-');

export interface AccountState {
  balance: number;
  openCents: number;
  /** Open charge id to cents still owed. */
  owed: Record<string, number>;
  reversed: Set<string>;
}

/** The same math as the server's `compute_account`, for showing which charges are still open. */
export function computeAccount(entries: LedgerEntry[]): AccountState {
  const replaced = new Set(entries.flatMap((e) => e.replaces ?? []));
  const live = entries.filter((e) => !replaced.has(e.id));
  const reversed = new Set(live.map((e) => e.reverses).filter((r): r is string => Boolean(r)));
  const net = live.reduce((sum, e) => sum + e.amountCents, 0);
  const owed: Record<string, number> = {};
  for (const e of live) {
    if (e.type === 'charge' && !e.fromCredit && !reversed.has(e.id)) {
      owed[e.id] = -e.amountCents;
    }
  }
  for (const e of live) {
    if (e.type !== 'payment' || reversed.has(e.id)) {
      continue;
    }
    for (const [chargeId, cents] of Object.entries(e.covers ?? {})) {
      if (chargeId in owed) {
        owed[chargeId] = Math.max(owed[chargeId] - cents, 0);
      }
    }
  }
  for (const id of Object.keys(owed)) {
    if (owed[id] === 0) {
      delete owed[id];
    }
  }
  const openCents = Object.values(owed).reduce((a, b) => a + b, 0);
  return { balance: net + openCents, openCents, owed, reversed };
}

/** Newest first: by date, then by when it was recorded. */
export function newestFirst(entries: LedgerEntry[]): LedgerEntry[] {
  const at = (e: LedgerEntry) => e.createdAt?.toMillis?.() ?? 0;
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || at(b) - at(a));
}

const TYPE_LABELS: Record<EntryType, string> = {
  sale: 'Fundraiser credit',
  charge: 'Charge',
  payment: 'Payment',
  adjustment: 'Correction',
  transfer: 'Transfer',
};

/** A short word for the entry, shown beside its description. */
export function entryLabel(entry: LedgerEntry, state: AccountState): string {
  if (entry.reverses) {
    return 'Reversal';
  }
  if (state.reversed.has(entry.id)) {
    return `${TYPE_LABELS[entry.type]}, reversed`;
  }
  if (entry.type === 'charge') {
    if (entry.fromCredit) {
      return 'Charge, paid from credit';
    }
    return entry.id in state.owed ? 'Charge, open' : 'Charge, paid';
  }
  return TYPE_LABELS[entry.type];
}

/** The amount to show: a payment from credit shows the credit it used. */
export function shownCents(entry: LedgerEntry): number {
  return entry.method === 'credit' ? -(entry.appliedCents ?? 0) : entry.amountCents;
}

/** True if the treasurer may reverse it: not a reversal, not a transfer, not already reversed. */
export function canReverse(entry: LedgerEntry, state: AccountState): boolean {
  return !entry.reverses && entry.type !== 'transfer' && !state.reversed.has(entry.id);
}

/** The account's name: the Scout, the troop's general fund, or a removed Scout's reference number. */
export function accountName(accountId: string, nameOf: (id: string) => string | undefined, ref?: string): string {
  if (accountId === GENERAL_FUND) {
    return "Troop's general fund";
  }
  if (isFormer(accountId)) {
    return `Former Scout ${ref ?? accountId.slice('former-'.length)}`;
  }
  return nameOf(accountId) ?? 'Unknown Scout';
}
