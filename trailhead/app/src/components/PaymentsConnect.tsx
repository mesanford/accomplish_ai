import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { usingEmulators } from '../lib/firebase';
import { connectStripe, disconnectStripe, isStripeUrl } from '../lib/payments';
import { usePayments } from '../lib/paymentsHooks';
import { useTroop } from '../lib/troop';
import { Notice } from './ui';

/** The treasurer connects the troop's own Stripe account (Stripe-hosted onboarding), checks it, or disconnects it.
 * Hidden while card payments are off. */
export function PaymentsConnect() {
  const { troopId } = useTroop();
  const payments = usePayments();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const checked = useRef(false);
  const back = params.get('stripe');

  useEffect(() => {
    // Back from Stripe: ask it whether the account can take payments yet.
    if (back && payments.on && payments.connected && !checked.current) {
      checked.current = true;
      payments.refresh().catch((err) => setError(errorMessage(err)));
    }
  }, [back, payments.on, payments.connected]);

  if (!payments.on) {
    return null;
  }

  async function run(action: () => Promise<void>) {
    setError('');
    setDone('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    run(async () => {
      const { url } = await connectStripe(troopId);
      if (!isStripeUrl(url, usingEmulators)) {
        throw new Error('Stripe could not be opened. Try again.');
      }
      window.location.assign(url);
    });
  const check = () => run(() => payments.refresh().then(() => setDone('Checked with Stripe.')));
  const disconnect = () => {
    if (!window.confirm('Stop card payments? The Stripe account and its money stay the troop\'s.')) {
      return;
    }
    run(() => disconnectStripe(troopId).then(() => setDone('Disconnected. Families can no longer pay by card.')));
  };

  return (
    <section className="card stack" aria-label="Card payments">
      <h2>Card payments</h2>
      <p className="small muted">
        Families can pay open charges by card. The money goes straight to the troop's own Stripe account (the troop or
        its chartered organization owns it), then to its bank. Forthright never holds the money and takes no fee.
        Stripe charges its own fee on each payment (2.9% + 30¢ for US cards).
      </p>
      {payments.mode === 'test' ? <Notice kind="warn">Stripe test mode: no real money moves.</Notice> : null}
      {!payments.connected ? (
        <div className="row">
          <button className="btn" type="button" onClick={connect} disabled={busy || payments.loading}>
            {busy ? 'Opening Stripe…' : 'Connect Stripe'}
          </button>
        </div>
      ) : null}
      {payments.connected && !payments.chargesEnabled ? (
        <>
          <p>Stripe is still setting up the troop's account. Finish the steps on Stripe, then check again.</p>
          <div className="row">
            <button className="btn" type="button" onClick={connect} disabled={busy}>
              Finish Stripe setup
            </button>
            <button className="btn quiet" type="button" onClick={check} disabled={busy}>
              Check again
            </button>
          </div>
        </>
      ) : null}
      {payments.chargesEnabled ? (
        <>
          <p>
            <strong>Connected.</strong> Families see "Pay online" on their Scout's account. Stripe account{' '}
            <code>{payments.accountId}</code>.
          </p>
          <div className="row">
            <a className="btn quiet small" href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer">
              Open the Stripe dashboard
            </a>
            <button className="btn quiet small" type="button" onClick={disconnect} disabled={busy}>
              Disconnect Stripe
            </button>
          </div>
        </>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
    </section>
  );
}
