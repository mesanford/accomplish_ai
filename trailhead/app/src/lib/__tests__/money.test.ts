import { describe, expect, it } from 'vitest';
import { amountProblem, centsToInput, formatCents, formatPercent, parseDollars, parsePercent } from '../money';
import { chargeProblem, chargeSummary, owedTotal, paymentProblem } from '../moneyForms';

describe('formatCents', () => {
  it('shows dollars and cents with a thousands separator', () => {
    expect(formatCents(1250)).toBe('$12.50');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(125000)).toBe('$1,250.00');
  });

  it('puts the minus sign before the dollar sign', () => {
    expect(formatCents(-500)).toBe('-$5.00');
  });
});

describe('parseDollars', () => {
  it('reads what people type', () => {
    expect(parseDollars('35')).toBe(3500);
    expect(parseDollars('12.5')).toBe(1250);
    expect(parseDollars('$1,250.00')).toBe(125000);
    expect(parseDollars(' 0.07 ')).toBe(7);
  });

  it('refuses anything that is not an amount', () => {
    for (const bad of ['', 'abc', '12.345', '-5', '1.2.3', '$']) {
      expect(parseDollars(bad)).toBeNull();
    }
  });

  it('round-trips through the form field text', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(0)).toBe('');
    expect(parseDollars(centsToInput(98765))).toBe(98765);
  });
});

describe('percentages', () => {
  it('turns a typed percent into basis points and back', () => {
    expect(parsePercent('30')).toBe(3000);
    expect(parsePercent('12.5%')).toBe(1250);
    expect(parsePercent('101')).toBeNull();
    expect(formatPercent(3000)).toBe('30%');
    expect(formatPercent(1250)).toBe('12.5%');
  });
});

describe('amountProblem', () => {
  it('needs an amount above zero and at most $10,000', () => {
    expect(amountProblem('35')).toBeNull();
    expect(amountProblem('0')).toBe('Enter an amount more than $0.00.');
    expect(amountProblem('10000.01')).toBe('Enter an amount of $10,000.00 or less.');
    expect(amountProblem('ten')).toBe('Enter an amount in dollars, like 35 or 12.50.');
  });
});

describe('charge form', () => {
  const form = { amount: '35', description: 'Fall campout', who: 'event' as const, eventId: 'e1', picked: [] };

  it('needs an amount, a description and who it applies to', () => {
    expect(chargeProblem(form)).toBeNull();
    expect(chargeProblem({ ...form, description: ' ' })).toContain('description');
    expect(chargeProblem({ ...form, eventId: '' })).toBe('Choose the event.');
    expect(chargeProblem({ ...form, who: 'list' })).toBe('Tick at least one Scout.');
    expect(chargeProblem({ ...form, who: 'everyone', eventId: '' })).toBeNull();
  });

  it('says how many were paid from credit and how many stay open', () => {
    const text = chargeSummary({ posted: 14, paidFromCredit: 9, open: 5, skipped: [] }, 3500);
    expect(text).toBe('Posted 14 charges of $35.00. 9 paid from account credit, 5 open for the family to pay.');
    expect(chargeSummary({ posted: 0, paidFromCredit: 0, open: 0, skipped: ['s1'] }, 3500)).toContain('skipped');
  });
});

describe('payment form', () => {
  const form = { scoutId: 's1', amount: '35', method: 'cash', chosenOwed: [3500], balance: 0, allowNegative: false };

  it('records cash for a chosen Scout', () => {
    expect(paymentProblem(form)).toBeNull();
    expect(paymentProblem({ ...form, scoutId: '' })).toBe('Choose the Scout.');
  });

  it('only lets account credit pay ticked charges within the balance', () => {
    expect(paymentProblem({ ...form, method: 'credit', chosenOwed: [] })).toContain('Tick the charges');
    expect(paymentProblem({ ...form, method: 'credit', balance: 1000 })).toBe('There is only $10.00 of account credit.');
    expect(paymentProblem({ ...form, method: 'credit', balance: 1000, allowNegative: true })).toBeNull();
  });

  it('starts the amount at what the ticked charges owe', () => {
    expect(owedTotal([3500, 1250])).toBe('47.50');
    expect(owedTotal([])).toBe('');
  });
});
