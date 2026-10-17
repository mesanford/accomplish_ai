import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { formatFee } from '../../lib/eventSignups';
import { chargeEventFees } from '../../lib/eventsApi';
import { useMoneyAccess } from '../../lib/moneyHooks';
import { plural } from '../../lib/plural';
import type { TroopEvent } from '../../lib/types';
import { Notice } from '../ui';

/** The treasurer charges the event fee to the Scouts who are going or who came. Each Scout is charged once. */
export function FeesPanel({ troopId, event }: { troopId: string; event: TroopEvent }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { isTreasurer } = useMoneyAccess();
  if (!event.feeCents) {
    return null;
  }
  async function charge(who: 'going' | 'attendees') {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const done = await chargeEventFees(troopId, event.id, who);
      if (done.charged === 0) {
        setMessage('No one new to charge. Each Scout is charged once.');
      } else if (done.state === 'pending') {
        setMessage(
          `${plural(done.charged, 'charge')} saved. They post to Scout accounts once accounts are set up.`,
        );
      } else {
        setMessage(`Charged ${plural(done.charged, 'Scout')}.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const waiting = event.feesPending?.count ?? 0;
  return (
    <section className="card stack" aria-label="Event fee">
      <h2>Fee: {formatFee(event.feeCents)} per Scout</h2>
      {isTreasurer ? null : (
        <p className="small">The treasurer charges this fee to Scout accounts.</p>
      )}
      <p className="small muted">Each Scout is charged once, even if you press a button again.</p>
      {isTreasurer ? (
        <div className="row">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => charge('going')}
          >
            Charge going Scouts
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => charge('attendees')}
          >
            Charge attendees
          </button>
        </div>
      ) : null}
      {waiting > 0 ? (
        <p className="small">{plural(waiting, 'charge')} waiting to post to Scout accounts.</p>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
    </section>
  );
}
