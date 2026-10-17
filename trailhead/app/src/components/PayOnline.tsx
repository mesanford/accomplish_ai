import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { usingEmulators } from '../lib/firebase';
import type { LedgerEntry } from '../lib/ledger';
import { amountProblem, formatCents, parseDollars } from '../lib/money';
import { useMoneyAccess } from '../lib/moneyHooks';
import { createCheckout, feeFor, isStripeUrl, MIN_CENTS, statusLabel } from '../lib/payments';
import { usePaymentRecords, usePayments } from '../lib/paymentsHooks';
import { useTroop } from '../lib/troop';
import { Field, formatDate, Notice } from './ui';

const RETURN_WORDS: Record<string, { kind: 'ok' | 'warn'; text: string }> = {
  done: { kind: 'ok', text: 'Thank you. The payment shows on this account once Stripe confirms it, usually within a minute.' },
  cancelled: { kind: 'warn', text: 'Payment cancelled. Nothing was charged.' },
};

/** "Pay online" for a parent: open charges (or an amount toward the balance, if the troop allows it) by card on
 * Stripe's own page. Shown only when card payments are on and the troop's Stripe account is ready. */
export function PayOnline({ scoutId, open, owed }: { scoutId: string; open: LedgerEntry[]; owed: Record<string, number> }) {
  const { troopId, parentOf } = useTroop();
  const { settings } = useMoneyAccess();
  const payments = usePayments();
  const isParent = parentOf(scoutId);
  const records = usePaymentRecords(scoutId, payments.on && isParent);
  const [params] = useSearchParams();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [byAmount, setByAmount] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!payments.on || !payments.chargesEnabled || !isParent) {
    return null;
  }
  const canPrepay = settings.allowPrepay;
  if (open.length === 0 && !canPrepay) {
    return null;
  }
  const chosen = (picked ?? open.map((e) => e.id)).filter((id) => id in owed);
  const amountMode = canPrepay && (byAmount || open.length === 0);
  const base = amountMode ? (parseDollars(amountText) ?? 0) : chosen.reduce((sum, id) => sum + owed[id], 0);
  const fee = feeFor(base, settings.cardFee);
  const back = RETURN_WORDS[params.get('payment') ?? ''];

  function toggle(id: string, on: boolean) {
    setPicked(on ? [...chosen, id] : chosen.filter((c) => c !== id));
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problem = amountMode ? amountProblem(amountText) : null;
    if (problem || (!amountMode && chosen.length === 0)) {
      setError(problem ?? 'Choose at least one charge to pay.');
      return;
    }
    if (base < MIN_CENTS) {
      setError('Online payments must be $0.50 or more.');
      return;
    }
    setBusy(true);
    try {
      const form = amountMode ? { troopId, scoutId, amountCents: base } : { troopId, scoutId, chargeIds: chosen };
      const { url } = await createCheckout(form);
      if (!isStripeUrl(url, usingEmulators)) {
        throw new Error('The payment page could not be opened. Nothing was charged.');
      }
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={pay} aria-label="Pay online">
      <h3>Pay online</h3>
      {back ? <Notice kind={back.kind}>{back.text}</Notice> : null}
      {payments.mode === 'test' ? (
        <Notice kind="warn">Test mode: no real money moves. Use Stripe's test card 4242 4242 4242 4242.</Notice>
      ) : null}
      {open.length > 0 && canPrepay ? (
        <label className="check">
          <input type="checkbox" checked={byAmount} onChange={(e) => setByAmount(e.target.checked)} />
          Pay a different amount toward the balance
        </label>
      ) : null}
      {amountMode ? (
        <Field label="Amount to pay" htmlFor="pay-amount" hint="It pays open charges first, oldest first; the rest is account credit.">
          <input id="pay-amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
      ) : (
        <fieldset className="stack">
          <legend className="small muted">Charges to pay</legend>
          {open.map((e) => (
            <label className="check" key={e.id}>
              <input type="checkbox" checked={chosen.includes(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} />
              {e.description}, {formatCents(owed[e.id])}
            </label>
          ))}
        </fieldset>
      )}
      {fee > 0 ? (
        <p className="small">
          Card processing fee: {formatCents(fee)}. The troop adds Stripe's fee (2.9% + 30¢) so it receives the full amount.
        </p>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <div className="row">
        <button className="btn" type="submit" disabled={busy || base <= 0}>
          {busy ? 'Opening Stripe…' : `Pay ${formatCents(base + fee)} by card`}
        </button>
      </div>
      <p className="small muted">
        You pay on Stripe's secure page. Card details go to Stripe, never to Forthright, and the money goes straight to
        the troop's own Stripe account.
      </p>
      {records.data.length > 0 ? (
        <ul className="small" aria-label="Card payments">
          {records.data.slice(0, 5).map((p) => (
            <li key={p.id}>
              {formatDate(p.date)}: {formatCents(p.totalCents)}, {statusLabel(p)}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
