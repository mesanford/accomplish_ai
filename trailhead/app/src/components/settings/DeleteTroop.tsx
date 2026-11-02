import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteTroop, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTroop } from '../../lib/troop';
import { Notice } from '../ui';

/** Delete a troop that only you are in, such as a copy made before finding the troop already on Forthright. The
 * server checks again (see delete_blocker in functions/handlers/troop_match.py). */
export function DeleteTroop() {
  const { troopId, troop, members } = useTroop();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onlyMe = members.length > 0 && members.every((m) => m.kind === 'adult' && m.uid === user?.uid);

  if (!onlyMe) {
    return (
      <p className="muted small">
        Only a troop with just you in it, and no Scouts, can be deleted here. To leave a troop, delete your account on
        your Account page or ask another leader to remove you.
      </p>
    );
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await deleteTroop(troopId);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="muted small">
        You're the only person in this troop, so you can delete it, for example if you made it by mistake or your troop
        was already on Forthright. Everything in it is deleted for good, including its website.
      </p>
      <Notice kind="error">{error}</Notice>
      <div className="row">
        {confirming ? (
          <>
            <button type="button" className="btn danger" disabled={busy} onClick={remove}>
              {busy ? 'Deleting…' : `Yes, delete ${troop?.name ?? 'this troop'} for good`}
            </button>
            <button type="button" className="btn quiet" disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="btn secondary" onClick={() => setConfirming(true)}>
            Delete this troop
          </button>
        )}
      </div>
    </div>
  );
}
