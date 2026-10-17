import { accountName, computeAccount, entryLabel, type AccountDoc, type LedgerEntry, shownCents } from './ledger';

/** Spreadsheet exports for the troop's books. Amounts are plain dollars ("12.50", "-35.00") so a spreadsheet adds
 * them up; text that starts with = + - @ gets a leading apostrophe so it is never read as a formula. */

function text(value: string | undefined): string {
  const safe = /^[=+\-@]/.test(value ?? '') ? `'${value}` : (value ?? '');
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const dollars = (cents: number) => (cents / 100).toFixed(2);

function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.join(',')).join('\r\n') + '\r\n';
}

export const BALANCES_HEADER = ['Account', 'Balance', 'Open charges', 'Entries'];

/** One line per account: the troop summary. */
export function balancesCsv(accounts: AccountDoc[], nameOf: (id: string) => string | undefined): string {
  const rows = accounts.map((a) => [
    text(accountName(a.id, nameOf, a.scoutRef)),
    dollars(a.balanceCents),
    dollars(a.openChargesCents),
    String(a.entryCount),
  ]);
  return toCsv(BALANCES_HEADER, rows);
}

export const LEDGER_HEADER = ['Date', 'Account', 'Type', 'Description', 'Amount', 'Method', 'Reason', 'Recorded by', 'Entry id', 'Reverses'];

/** Every entry, oldest first, for the troop's books. */
export function ledgerCsv(entries: LedgerEntry[], nameOf: (id: string) => string | undefined): string {
  const byAccount = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    byAccount.set(e.scoutId, [...(byAccount.get(e.scoutId) ?? []), e]);
  }
  const states = new Map([...byAccount].map(([id, list]) => [id, computeAccount(list)]));
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const rows = sorted.map((e) => [
    e.date,
    text(accountName(e.scoutId, nameOf, e.scoutRef)),
    text(entryLabel(e, states.get(e.scoutId) ?? computeAccount([]))),
    text(e.description),
    dollars(shownCents(e)),
    e.method ?? '',
    text(e.reason),
    text(e.createdByName),
    e.id,
    e.reverses ?? '',
  ]);
  return toCsv(LEDGER_HEADER, rows);
}
