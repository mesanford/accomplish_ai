import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Notice, PageHeader } from '../components/ui';
import { deleteAccount, errorMessage } from '../lib/api';
import { signOutUser, useAuth } from '../lib/auth';
import { ACCOUNT_DELETES, ACCOUNT_KEPT, CANNOT_UNDO } from '../lib/removal';

/** Account settings. For now, just deleting your own account. */
export function Account() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await deleteAccount();
      await signOutUser().catch(() => undefined); // the sign-in no longer exists on the server
      navigate('/signin', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Trailhead" title="Your account" />
      <p className="muted">Signed in as {user?.email ?? 'you'}.</p>
      <section className="card stack">
        <h2>Delete my account</h2>
        {open ? (
          <>
            <p className="small">
              <strong>Deleting your account removes:</strong>
            </p>
            <ul className="small">
              {ACCOUNT_DELETES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="small">
              <strong>What stays:</strong>
            </p>
            <ul className="small">
              {ACCOUNT_KEPT.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="small">
              <strong>{CANNOT_UNDO}</strong> If you are the only leader of a troop, you will need to invite another
              leader first.
            </p>
            <div className="row">
              <button type="button" className="btn danger" disabled={busy} onClick={remove}>
                {busy ? 'Deleting…' : 'Yes, permanently delete my account'}
              </button>
              <button type="button" className="btn quiet" disabled={busy} onClick={() => setOpen(false)}>
                Keep my account
              </button>
            </div>
            <Notice kind="error">{error}</Notice>
          </>
        ) : (
          <>
            <p className="small">
              This removes your sign-in and your place in your troops. Your Scouts' records stay with the troop. To
              remove a Scout, ask a troop leader to use Remove from troop on the Scout's page.
            </p>
            <div className="row">
              <button type="button" className="btn danger small" onClick={() => setOpen(true)}>
                Delete my account
              </button>
              <Link className="btn quiet small" to="/privacy">
                Privacy policy
              </Link>
            </div>
          </>
        )}
      </section>
    </>
  );
}
