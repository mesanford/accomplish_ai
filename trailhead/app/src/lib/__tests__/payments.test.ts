import { describe, expect, it } from 'vitest';
import { dashboardUrl, feeFor, grossUp, isStripeUrl, type PaymentRecord, statusLabel, stripeFee } from '../payments';
import { PAYMENTS_HEADER, paymentsCsv } from '../paymentsCsv';

describe('card fee preview', () => {
  it('matches the server: $35.00 becomes $36.35', () => {
    expect(grossUp(3500)).toBe(3635);
    expect(feeFor(3500, true)).toBe(135);
    expect(feeFor(3500, false)).toBe(0);
    expect(stripeFee(10000)).toBe(320);
  });

  it('is the smallest total that leaves the troop the whole amount', () => {
    for (const base of [50, 99, 100, 1000, 4999, 12345, 1_000_000]) {
      const total = grossUp(base);
      expect(total - stripeFee(total)).toBeGreaterThanOrEqual(base);
      expect(total - 1 - stripeFee(total - 1)).toBeLessThan(base);
    }
  });
});

describe('isStripeUrl', () => {
  it("only sends people to Stripe's own pages", () => {
    expect(isStripeUrl('https://checkout.stripe.com/c/pay/cs_1', false)).toBe(true);
    expect(isStripeUrl('https://connect.stripe.com/setup/s/abc', false)).toBe(true);
    for (const bad of ['https://checkout.stripe.com.evil.io/x', 'http://checkout.stripe.com/x', 'https://evil.io/', 'javascript:alert(1)']) {
      expect(isStripeUrl(bad, false)).toBe(false);
    }
  });

  it('allows a local page only on the emulator', () => {
    expect(isStripeUrl('http://localhost:5180/fake-checkout', true)).toBe(true);
    expect(isStripeUrl('http://localhost:5180/fake-checkout', false)).toBe(false);
  });
});

describe('statusLabel and dashboardUrl', () => {
  it('says what happened in plain words', () => {
    expect(statusLabel({ status: 'paid' })).toBe('Paid');
    expect(statusLabel({ status: 'expired' })).toBe('Not finished');
    expect(statusLabel({ status: 'paid', dispute: { status: 'needs_response' } })).toBe('Paid, disputed (needs response)');
  });

  it("links to the payment in the troop's own dashboard", () => {
    expect(dashboardUrl({ mode: 'test', paymentIntentId: 'pi_1' })).toBe('https://dashboard.stripe.com/test/payments/pi_1');
    expect(dashboardUrl({ mode: 'live', paymentIntentId: 'pi_1' })).toBe('https://dashboard.stripe.com/payments/pi_1');
    expect(dashboardUrl({ mode: 'live' })).toBeNull();
  });
});

describe('paymentsCsv', () => {
  const base: PaymentRecord = {
    id: 'p1',
    scoutId: 's1',
    status: 'paid',
    chargeIds: ['c1'],
    amountCents: 3500,
    feeCents: 135,
    totalCents: 3635,
    description: 'Troop 1 activity fees',
    date: '2026-10-02',
    mode: 'test',
    stripeAccountId: 'acct_1',
    sessionId: 'cs_1',
    paymentIntentId: 'pi_1',
    ledgerEntryId: 'e1',
    createdBy: 'mom',
  };

  it('has one line per payment, oldest first, with ids to match against Stripe', () => {
    const later = { ...base, id: 'p2', date: '2026-10-05', scoutId: 'gone', status: 'refunded' as const, refundedCents: 3635 };
    const csv = paymentsCsv([later, base], (id) => (id === 's1' ? '=Sam' : undefined));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(PAYMENTS_HEADER.join(','));
    expect(lines[1]).toBe("2026-10-02,'=Sam,Paid,35.00,1.35,36.35,0.00,,pi_1,cs_1,e1,p1");
    expect(lines[2]).toContain('Former Scout,Refunded,35.00,1.35,36.35,36.35');
  });
});
