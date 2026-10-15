import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, removeScout } from '../lib/api';
import { CANNOT_UNDO, SCOUT_DELETES, SCOUT_KEPT, sameName } from '../lib/removal';
import { useTroop } from '../lib/troop';
import type { Member } from '../lib/types';
import { Field, Notice } from './ui';

/** A leader removes a Scout from the troop and deletes their records. The leader must type the Scout's name. */
export function RemoveScout({ scout }: { scout: Member }) {
  const { troopId } = useTroop();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await removeScout({ troopId, scoutId: scout.id, confirm: true });
      navigate(`/t/${troopId}/roster`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Remove from troop</h2>
      <p className="small">
        Use this when a Scout leaves the troop, or a family asks you to delete their child's information.
      </p>
      {open ? (
        <div className="stack">
          <p className="small">
            <strong>Deleting {scout.displayName} removes:</strong>
          </p>
          <ul className="small">
            {SCOUT_DELETES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="small muted">
            {SCOUT_KEPT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="small">
            <strong>{CANNOT_UNDO}</strong> If you might need these records later, download a Scoutbook report first.
          </p>
          <Field label={`Type ${scout.displayName} to confirm`} htmlFor="remove-confirm">
            <input
              id="remove-confirm"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
          <div className="row">
            <button
              type="button"
              className="btn danger"
              disabled={busy || !sameName(typed, scout.displayName)}
              onClick={remove}
            >
              {busy ? 'Deleting…' : `Delete ${scout.displayName}'s records`}
            </button>
            <button type="button" className="btn quiet" disabled={busy} onClick={() => setOpen(false)}>
              Keep this Scout
            </button>
          </div>
          <Notice kind="error">{error}</Notice>
        </div>
      ) : (
        <button type="button" className="btn danger small" onClick={() => setOpen(true)}>
          Remove {scout.displayName} from troop
        </button>
      )}
    </section>
  );
}
