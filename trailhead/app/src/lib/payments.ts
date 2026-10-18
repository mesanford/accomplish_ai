import { httpsCallable } from 'firebase/functions';
import type { Timestamp } from 'firebase/firestore';
import { functions } from './firebase';

/** Card payments through the troop's own Stripe account (functions/handlers/payments.py has the rules and math).
 * The server works out every amount; the fee shown here is a preview with the same formula. */

export type PaymentsMode = 'off' | 'test' | 'live';

export type PaymentStatus =
  | 'starting'
  | 'open'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'partially_refunded'
  | 'review';

/** troops/{t}/payments/{id}: one Stripe Checkout. Written only by the server. */
export interface PaymentRecord {
  id: string;
  scoutId: string;
  status: PaymentStatus;
  chargeIds: string[];
  /** What goes on the Scout's account. */
  amountCents: number;
  /** The card processing fee line, when the troop adds it. Paid to Stripe, never to the account. */
  feeCents: number;
  totalCents: number;
  description: string;
  date: string;
  mode: 'test' | 'live';
  stripeAccountId: string;
  sessionId?: string;
  paymentIntentId?: string;
  ledgerEntryId?: string;
  refundedCents?: number;
  dispute?: { id?: string; status?: string; reason?: string; amountCents?: number };
  reviewReason?: string;
  createdBy: string;
  createdAt?: Timestamp;
}

/** On the troop document under `payments`. Written only by the server. */
export interface TroopPayments {
  stripeAccountId?: string;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  mode?: 'test' | 'live';
}

export interface PaymentsStatus {
  mode: PaymentsMode;
  connected: boolean;
  chargesEnabled: boolean;
}

async function call<In, Out>(name: string, data: In): Promise<Out> {
  return (await httpsCallable<In, Out>(functions, name)(data)).data;
}

/** The page's own origin, which the server uses for Stripe's return links only when running on the emulator. */
const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);

export const paymentsStatus = (troopId: string, refresh = false) =>
  call<{ troopId: string; refresh: boolean }, PaymentsStatus>('payments_status', { troopId, refresh });

export const connectStripe = (troopId: string) =>
  call<{ troopId: string; origin: string }, { url: string }>('connect_stripe', { troopId, origin: origin() });

export const disconnectStripe = (troopId: string) =>
  call<{ troopId: string }, { disconnected: boolean }>('disconnect_stripe', { troopId });

export interface CheckoutForm {
  troopId: string;
  scoutId: string;
  chargeIds?: string[];
  amountCents?: number;
}

export const createCheckout = (form: CheckoutForm) =>
  call<CheckoutForm & { origin: string }, { url: string; paymentId: string }>('create_checkout', {
    ...form,
    origin: origin(),
  });

/** Stripe's US standard card fee on a total: 2.9% rounded to the nearest cent, plus 30 cents. */
export function stripeFee(totalCents: number): number {
  return Math.floor((totalCents * 29 + 500) / 1000) + 30;
}

/** The smallest card total that leaves the troop the whole amount after Stripe's fee. */
export function grossUp(baseCents: number): number {
  let total = Math.ceil(((baseCents + 30) * 1000) / 971);
  while (total - 1 - stripeFee(total - 1) >= baseCents) {
    total -= 1;
  }
  while (total - stripeFee(total) < baseCents) {
    total += 1;
  }
  return total;
}

export const feeFor = (baseCents: number, addFee: boolean) => (addFee ? grossUp(baseCents) - baseCents : 0);

export const MIN_CENTS = 50;

/** Only ever send the browser to Stripe's own Checkout or onboarding pages (or a local page on the emulator). */
export function isStripeUrl(url: string, local: boolean): boolean {
  if (/^https:\/\/(checkout|connect)\.stripe\.com\//.test(url)) {
    return true;
  }
  return local && /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url);
}

const STATUS_WORDS: Record<PaymentStatus, string> = {
  starting: 'Starting',
  open: 'Not finished',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  expired: 'Not finished',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
  review: 'Needs the treasurer',
};

/** Stripe's dispute statuses, in plain words. A dispute is a family asking their bank to take a payment back. */
const DISPUTE_WORDS: Record<string, string> = {
  needs_response: 'the troop needs to answer in Stripe',
  warning_needs_response: 'the troop needs to answer in Stripe',
  under_review: 'the bank is deciding',
  warning_under_review: 'the bank is deciding',
  warning_closed: 'closed',
  won: 'the troop kept the money',
  lost: 'the money went back to the family',
};

export function statusLabel(p: Pick<PaymentRecord, 'status' | 'dispute'>): string {
  const words = STATUS_WORDS[p.status] ?? p.status;
  if (!p.dispute?.status) {
    return words;
  }
  return `${words}, disputed (${DISPUTE_WORDS[p.dispute.status] ?? p.dispute.status.replace(/_/g, ' ')})`;
}

/** The treasurer's link to the payment in the troop's own Stripe dashboard. */
export function dashboardUrl(p: Pick<PaymentRecord, 'mode' | 'paymentIntentId'>): string | null {
  if (!p.paymentIntentId) {
    return null;
  }
  return `https://dashboard.stripe.com/${p.mode === 'test' ? 'test/' : ''}payments/${p.paymentIntentId}`;
}
