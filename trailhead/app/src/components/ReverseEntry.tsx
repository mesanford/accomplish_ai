import { type FormEvent, useState } from 'react';
import { errorMessage } from '../lib/api';
import { formatCents } from '../lib/money';
import { reverseEntry } from '../lib/moneyApi';
import { type LedgerEntry, shownCents } from '../lib/ledger';
import { useTroop } from '../lib/troop';
import { Field, Notice } from './ui';

/** The treasurer fixes a wrong entry. Nothing is edited: a reversal with a reason is added. */
export function ReverseEntry({ entry }: { entry: LedgerEntry }) {
  const { troopId } = useTroop();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Say why, like "Entered $40, sale was $14".');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reverseEntry({ troopId, entryId: entry.id, reason: reason.trim() });
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn quiet small" onClick={() => setOpen(true)}>
        Reverse
      </button>
    );
  }
  return (
    <form className="form stack" onSubmit={submit} aria-label={`Reverse ${entry.description}`}>
      <p className="small">
        This adds a correcting entry of {formatCents(-shownCents(entry))}. The original stays in the history.
      </p>
      <Field label="Reason" htmlFor={`reason-${entry.id}`}>
        <input id={`reason-${entry.id}`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Notice kind="error">{error}</Notice>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy}>
          {busy ? 'Reversing…' : 'Reverse entry'}
        </button>
        <button className="btn quiet small" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
