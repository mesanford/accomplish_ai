import { amountProblem, formatCents, parseDollars } from './money';

/** Checks and messages for the money forms, kept apart from the pages so they can be tested. */

export type Who = 'event' | 'list' | 'everyone';

export interface ChargeInput {
  amount: string;
  description: string;
  who: Who;
  eventId: string;
  picked: string[];
}

/** Why the charge can't be posted yet, or null. */
export function chargeProblem(form: ChargeInput): string | null {
  const amount = amountProblem(form.amount);
  if (amount) {
    return amount;
  }
  if (!form.description.trim()) {
    return 'Add a short description, like "Fall campout".';
  }
  if (form.who === 'event' && !form.eventId) {
    return 'Choose the event.';
  }
  if (form.who === 'list' && form.picked.length === 0) {
    return 'Tick at least one Scout.';
  }
  return null;
}

export interface ChargeOutcome {
  posted: number;
  paidFromCredit: number;
  open: number;
  skipped: string[];
}

/** What the treasurer sees after posting: how many were paid from credit and how many stay open. */
export function chargeSummary(r: ChargeOutcome, cents: number): string {
  const parts = [`Posted ${r.posted} ${r.posted === 1 ? 'charge' : 'charges'} of ${formatCents(cents)}.`];
  if (r.posted > 0) {
    parts.push(`${r.paidFromCredit} paid from account credit, ${r.open} open for the family to pay.`);
  }
  if (r.skipped.length > 0) {
    parts.push(`${r.skipped.length} already had this charge for the event, so they were skipped.`);
  }
  return parts.join(' ');
}

export interface PaymentInput {
  scoutId: string;
  amount: string;
  method: string;
  /** Cents still owed on each chosen charge. */
  chosenOwed: number[];
  balance: number;
  allowNegative: boolean;
}

/** Why the payment can't be recorded yet, or null. */
export function paymentProblem(form: PaymentInput): string | null {
  if (!form.scoutId) {
    return 'Choose the Scout.';
  }
  const amount = amountProblem(form.amount);
  if (amount) {
    return amount;
  }
  if (form.method === 'credit') {
    const cents = parseDollars(form.amount) ?? 0;
    const owed = form.chosenOwed.reduce((a, b) => a + b, 0);
    if (form.chosenOwed.length === 0 || cents > owed) {
      return 'Account credit only pays open charges. Tick the charges it pays.';
    }
    if (!form.allowNegative && cents > form.balance) {
      return `There is only ${formatCents(form.balance)} of account credit.`;
    }
  }
  return null;
}

/** The amount a payment starts with: everything owed on the ticked charges. */
export function owedTotal(owed: number[]): string {
  const cents = owed.reduce((a, b) => a + b, 0);
  return cents ? (cents / 100).toFixed(2) : '';
}
