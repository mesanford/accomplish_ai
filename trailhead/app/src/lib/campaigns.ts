import type { Timestamp } from 'firebase/firestore';
import { formatCents, formatPercent, parseDollars, parsePercent } from './money';

/** Fundraiser campaigns and the troop's account settings (functions/handlers/campaigns.py, account_settings.py). */

export type RuleKind = 'percent' | 'perItem' | 'none';

/** percent: value in basis points (3000 is 30%). perItem: cents per item. none: value 0. */
export interface CreditRule {
  kind: RuleKind;
  value: number;
}

export interface SalesRow {
  salesCents: number;
  items: number;
}

/** troops/{t}/campaigns/{id}. Only the server writes it. */
export interface Campaign {
  id: string;
  name: string;
  rule: CreditRule;
  status: 'open' | 'posted';
  sales: Record<string, SalesRow>;
  totals?: { salesCents: number; creditCents: number; troopCents: number };
  postedAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** On the troop document under `accounts`. Written only by save_account_settings. */
export interface AccountSettings {
  allowNegative: boolean;
  defaultRule: CreditRule;
  creditPolicy: string;
  leavingDefault: 'general' | 'sibling';
  /** Card payments: add Stripe's processing fee for the family to pay. */
  cardFee: boolean;
  /** Card payments: families may pay any amount toward the balance, not only open charges. */
  allowPrepay: boolean;
}

/** The committee has not chosen yet, so the cautious choices: profit stays with the troop, no negative balances. */
export const DEFAULT_SETTINGS: AccountSettings = {
  allowNegative: false,
  defaultRule: { kind: 'percent', value: 0 },
  creditPolicy: '',
  leavingDefault: 'general',
  cardFee: false,
  allowPrepay: false,
};

export function settingsOf(saved: Partial<AccountSettings> | undefined): AccountSettings {
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}

/** The same rounding as the server: percentages round half a cent up. */
export function creditFor(rule: CreditRule, salesCents: number, items: number): number {
  if (rule.kind === 'percent') {
    return Math.floor((salesCents * rule.value + 5000) / 10000);
  }
  if (rule.kind === 'perItem') {
    return items * rule.value;
  }
  return 0;
}

export function campaignTotals(rule: CreditRule, sales: Record<string, SalesRow>) {
  const rows = Object.values(sales);
  const salesCents = rows.reduce((sum, r) => sum + r.salesCents, 0);
  const creditCents = rows.reduce((sum, r) => sum + creditFor(rule, r.salesCents, r.items), 0);
  return { salesCents, creditCents, troopCents: salesCents - creditCents };
}

/** The rule in words, as families and the treasurer see it. */
export function ruleText(rule: CreditRule): string {
  if (rule.kind === 'percent' && rule.value > 0) {
    return `${formatPercent(rule.value)} of each Scout's sales goes to their account.`;
  }
  if (rule.kind === 'perItem' && rule.value > 0) {
    return `${formatCents(rule.value)} for each item sold goes to the Scout's account.`;
  }
  return "No credit to Scouts. All profit stays with the troop.";
}

export interface PasteResult {
  sales: Record<string, SalesRow>;
  /** Lines whose name matched no Scout, or whose amount wasn't a number. */
  skipped: string[];
}

/** Rows pasted from a spreadsheet: a name, then sales in dollars, then items (optional), split by tabs or commas.
 * Names match the roster ignoring case and extra spaces. A header row or a blank line is skipped quietly. */
export function parsePastedSales(text: string, scouts: { id: string; displayName: string }[]): PasteResult {
  const byName = new Map(scouts.map((s) => [s.displayName.trim().replace(/\s+/g, ' ').toLowerCase(), s.id]));
  const sales: Record<string, SalesRow> = {};
  const skipped: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim());
    if (!cells[0]) {
      continue;
    }
    const id = byName.get(cells[0].replace(/\s+/g, ' ').toLowerCase());
    const cents = parseDollars(cells[1] ?? '');
    const items = cells[2] ? Number(cells[2]) : 0;
    if (!id || cents === null || !Number.isInteger(items) || items < 0) {
      if (id || cents !== null) {
        skipped.push(cells[0]); // it looked like a sales line; a header row does not
      }
      continue;
    }
    sales[id] = { salesCents: cents, items };
  }
  return { sales, skipped };
}

/** A rule from the form: the kind, and the typed percentage or dollars per item. Null if the number isn't valid. */
export function ruleFromInput(kind: RuleKind, text: string): CreditRule | null {
  if (kind === 'none') {
    return { kind, value: 0 };
  }
  const value = kind === 'percent' ? parsePercent(text || '0') : parseDollars(text || '0');
  if (value === null || (kind === 'perItem' && value > 10000)) {
    return null;
  }
  return { kind, value };
}

/** What the sales table holds while someone types: dollars and items as text, by Scout id. */
export type SalesInput = Record<string, { sales: string; items: string }>;

/** The typed table as sales rows, or the first problem found. Empty rows are left out. */
export function salesFromInput(input: SalesInput): { sales: Record<string, SalesRow>; problem: string | null } {
  const sales: Record<string, SalesRow> = {};
  for (const [id, row] of Object.entries(input)) {
    const cents = row.sales.trim() ? parseDollars(row.sales) : 0;
    const items = row.items.trim() ? Number(row.items) : 0;
    if (cents === null || !Number.isInteger(items) || items < 0) {
      return { sales, problem: 'Enter sales in dollars, like 125.50, and items as whole numbers.' };
    }
    if (cents || items) {
      sales[id] = { salesCents: cents, items };
    }
  }
  return { sales, problem: null };
}

/** The text a rule's number field starts with. */
export function ruleToInput(rule: CreditRule): string {
  if (rule.kind === 'percent') {
    return String(rule.value / 100);
  }
  return rule.kind === 'perItem' ? (rule.value / 100).toFixed(2) : '';
}
