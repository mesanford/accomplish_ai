import { dollars } from './moneyCsv';
import { type PaymentRecord, statusLabel } from './payments';

/** The reconciliation spreadsheet: one line per card payment, to match against the Stripe payout report. The Stripe
 * payment id is the column to match on. Text starting with = + - @ gets an apostrophe so it is never a formula. */

function text(value: string | undefined): string {
  const safe = /^[=+\-@]/.test(value ?? '') ? `'${value}` : (value ?? '');
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const PAYMENTS_HEADER = [
  'Date',
  'Scout',
  'Status',
  'To Scout account',
  'Card fee line',
  'Card total',
  'Refunded',
  'Dispute',
  'Stripe payment id',
  'Stripe checkout id',
  'Ledger entry id',
  'Payment record id',
];

export function paymentsCsv(payments: PaymentRecord[], nameOf: (id: string) => string | undefined): string {
  const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const rows = sorted.map((p) => [
    p.date,
    text(nameOf(p.scoutId) ?? 'Former Scout'),
    text(statusLabel({ status: p.status })),
    dollars(p.amountCents),
    dollars(p.feeCents),
    dollars(p.totalCents),
    dollars(p.refundedCents ?? 0),
    text(p.dispute?.status ?? ''),
    p.paymentIntentId ?? '',
    p.sessionId ?? '',
    p.ledgerEntryId ?? '',
    p.id,
  ]);
  return [PAYMENTS_HEADER, ...rows].map((r) => r.join(',')).join('\r\n') + '\r\n';
}
