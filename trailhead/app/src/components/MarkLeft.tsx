import { useState } from 'react';
import { errorMessage, markScoutLeft } from '../lib/api';
import { LEFT_EXPLAINED, scoutDeletionDate } from '../lib/retention';
import { useTroop } from '../lib/troop';
import type { Member } from '../lib/types';
import { Notice } from './ui';

const longDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

/** A leader records that a Scout has left the troop (or undoes it). The records are deleted 12 months later. */
export function MarkLeft({ scout }: { scout: Member }) {
  const { troopId } = useTroop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const leftAt = scout.leftAt ? scout.leftAt.toDate() : null;

  async function change(left: boolean) {
    setBusy(true);
    setError('');
    try {
      await markScoutLeft({ troopId, scoutId: scout.id, left });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Left the troop</h2>
      {leftAt ? (
        <div className="stack">
          <p className="small">
            {scout.displayName} left the troop on {longDate(leftAt)}. Their records will be deleted automatically by{' '}
            <strong>{longDate(scoutDeletionDate(leftAt))}</strong>.
          </p>
          <div>
            <button type="button" className="btn secondary small" disabled={busy} onClick={() => change(false)}>
              {busy ? 'Saving…' : `${scout.displayName} is back in the troop`}
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="small">{LEFT_EXPLAINED}</p>
          <div>
            <button type="button" className="btn secondary small" disabled={busy} onClick={() => change(true)}>
              {busy ? 'Saving…' : `Mark ${scout.displayName} as left the troop`}
            </button>
          </div>
        </div>
      )}
      <Notice kind="error">{error}</Notice>
    </section>
  );
}
