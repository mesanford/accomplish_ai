import { describe, expect, it } from 'vitest';
import {
  campaignTotals,
  creditFor,
  parsePastedSales,
  ruleFromInput,
  ruleText,
  ruleToInput,
  salesFromInput,
  settingsOf,
} from '../campaigns';
import { accountName, canReverse, computeAccount, entryLabel, type LedgerEntry, newestFirst, shownCents } from '../ledger';
import { balancesCsv, ledgerCsv } from '../moneyCsv';

let n = 0;
function entry(fields: Partial<LedgerEntry>): LedgerEntry {
  n += 1;
  return {
    id: `e${n}`,
    scoutId: 's1',
    type: 'sale',
    amountCents: 0,
    description: 'Entry',
    date: '2026-10-01',
    createdBy: 'u1',
    createdByName: 'Pat Treasurer',
    ...fields,
  };
}

describe('computeAccount (same math as the server)', () => {
  it('keeps open charges out of the balance', () => {
    const sale = entry({ amountCents: 1000 });
    const charge = entry({ type: 'charge', amountCents: -3500, fromCredit: false });
    const state = computeAccount([sale, charge]);
    expect(state.balance).toBe(1000);
    expect(state.openCents).toBe(3500);
    expect(entryLabel(charge, state)).toBe('Charge, open');
  });

  it('closes a charge with a payment or a reversal', () => {
    const charge = entry({ type: 'charge', amountCents: -3500, fromCredit: false });
    const paid = entry({ type: 'payment', method: 'check', amountCents: 3500, covers: { [charge.id]: 3500 } });
    expect(entryLabel(charge, computeAccount([charge, paid]))).toBe('Charge, paid');
    const reversal = entry({ type: 'adjustment', amountCents: 3500, reverses: charge.id, reason: 'Did not go' });
    const state = computeAccount([charge, reversal]);
    expect([state.balance, state.openCents]).toEqual([0, 0]);
    expect(entryLabel(charge, state)).toBe('Charge, reversed');
    expect(entryLabel(reversal, state)).toBe('Reversal');
    expect(canReverse(charge, state)).toBe(false);
    expect(canReverse(reversal, state)).toBe(false);
  });

  it('shows a payment from credit as the credit it used', () => {
    const fromCredit = entry({ type: 'payment', method: 'credit', amountCents: 0, appliedCents: 3500 });
    expect(shownCents(fromCredit)).toBe(-3500);
  });

  it('leaves out entries a brought-forward entry replaces', () => {
    const old = entry({ amountCents: 5000 });
    const carry = entry({ type: 'adjustment', amountCents: 5000, broughtForward: true, replaces: [old.id] });
    expect(computeAccount([old, carry]).balance).toBe(5000);
  });

  it('sorts newest first', () => {
    const a = entry({ date: '2026-01-01' });
    const b = entry({ date: '2026-03-01' });
    expect(newestFirst([a, b]).map((e) => e.id)).toEqual([b.id, a.id]);
  });
});

describe('account names', () => {
  it('names the general fund and removed Scouts without their name', () => {
    const nameOf = (id: string) => ({ s1: 'Sam' })[id];
    expect(accountName('s1', nameOf)).toBe('Sam');
    expect(accountName('troop-fund', nameOf)).toBe("Troop's general fund");
    expect(accountName('former-12345678', nameOf, '12345678')).toBe('Former Scout 12345678');
  });
});

describe('credit rules', () => {
  it('match the server rounding', () => {
    expect(creditFor({ kind: 'percent', value: 3000 }, 10000, 0)).toBe(3000);
    expect(creditFor({ kind: 'percent', value: 5000 }, 1, 0)).toBe(1);
    expect(creditFor({ kind: 'perItem', value: 150 }, 0, 12)).toBe(1800);
    expect(creditFor({ kind: 'none', value: 0 }, 10000, 3)).toBe(0);
  });

  it('read from the form and say what they mean', () => {
    expect(ruleFromInput('percent', '30')).toEqual({ kind: 'percent', value: 3000 });
    expect(ruleFromInput('perItem', '1.50')).toEqual({ kind: 'perItem', value: 150 });
    expect(ruleFromInput('percent', 'lots')).toBeNull();
    expect(ruleToInput({ kind: 'percent', value: 1250 })).toBe('12.5');
    expect(ruleText({ kind: 'percent', value: 3000 })).toBe("30% of each Scout's sales goes to their account.");
    expect(ruleText(settingsOf(undefined).defaultRule)).toBe('No credit to Scouts. All profit stays with the troop.');
  });

  it('total a campaign', () => {
    const sales = { s1: { salesCents: 10000, items: 0 }, s2: { salesCents: 4550, items: 0 } };
    expect(campaignTotals({ kind: 'percent', value: 3000 }, sales)).toEqual({
      salesCents: 14550,
      creditCents: 4365,
      troopCents: 10185,
    });
  });
});

describe('sales entry', () => {
  const scouts = [
    { id: 's1', displayName: 'Sam Lee' },
    { id: 's2', displayName: 'Ava' },
  ];

  it('reads rows pasted from a spreadsheet and reports lines it could not match', () => {
    const text = 'Name\tSales\tItems\nsam  lee\t$125.50\t9\nAva\t40\nNobody\t10\n';
    const result = parsePastedSales(text, scouts);
    expect(result.sales).toEqual({ s1: { salesCents: 12550, items: 9 }, s2: { salesCents: 4000, items: 0 } });
    expect(result.skipped).toEqual(['Nobody']);
  });

  it('turns the typed table into sales and drops empty rows', () => {
    const typed = { s1: { sales: '100', items: '' }, s2: { sales: '', items: '' } };
    expect(salesFromInput(typed)).toEqual({ sales: { s1: { salesCents: 10000, items: 0 } }, problem: null });
    expect(salesFromInput({ s1: { sales: 'ten', items: '' } }).problem).toContain('dollars');
  });
});

describe('spreadsheet export', () => {
  it('writes balances and entries as plain dollars, with formulas defused', () => {
    const accounts = [
      { id: 's1', scoutId: 's1', balanceCents: 1250, openChargesCents: 3500, openChargeCount: 1, entryCount: 2 },
    ];
    expect(balancesCsv(accounts, () => 'Sam')).toBe('Account,Balance,Open charges,Entries\r\nSam,12.50,35.00,2\r\n');
    const csv = ledgerCsv([entry({ amountCents: -3500, type: 'charge', description: '=HYPERLINK("x")' })], () => 'Sam');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(',-35.00,');
  });
});
