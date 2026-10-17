import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Notice, PageHeader } from '../components/ui';
import { announcementEmailsOn, ANNOUNCEMENT_EMAIL_LABEL } from '../lib/announcements';
import {
  deleteAccount,
  errorMessage,
  setEmailAnnouncements,
  setEmailNotifications,
} from '../lib/api';
import { signOutUser, useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { EMAIL_NOTIFICATIONS_LABEL, emailNotificationsOn } from '../lib/notifications';
import { ACCOUNT_DELETES, ACCOUNT_KEPT, CANNOT_UNDO } from '../lib/removal';

/** Account settings: email notifications, and deleting your own account. */
export function Account() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [mailError, setMailError] = useState('');
  const userRef = useMemo(() => (user ? doc(db, 'users', user.uid) : null), [user]);
  const prefs = useDoc<{ emailNotifications?: boolean; emailAnnouncements?: boolean }>(
    userRef,
  ).data;
  // Shows the new setting while it saves, so the box doesn't flick back until the user record updates.
  const [pending, setPending] = useState<{ notifications?: boolean; announcements?: boolean }>({});
  const emailOn = pending.notifications ?? emailNotificationsOn(prefs);
  const announcementsOn = pending.announcements ?? announcementEmailsOn(prefs);

  async function changeAnnouncements(enabled: boolean) {
    await changeEmail(enabled, setEmailAnnouncements, 'announcements');
  }

  async function changeEmail(
    enabled: boolean,
    save: (on: boolean) => Promise<unknown> = setEmailNotifications,
    key: 'notifications' | 'announcements' = 'notifications',
  ) {
    setSaving(true);
    setMailError('');
    setPending((p) => ({ ...p, [key]: enabled }));
    try {
      await save(enabled);
    } catch (err) {
      setMailError(errorMessage(err));
      setPending((p) => ({ ...p, [key]: undefined }));
    } finally {
      setSaving(false);
    }
  }

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
      <PageHeader eyebrow="Forthright" title="Your account" />
      <p className="muted">Signed in as {user?.email ?? 'you'}.</p>
      <section className="card stack">
        <h2>Email</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={emailOn}
            disabled={saving}
            onChange={(e) => changeEmail(e.target.checked)}
          />
          {EMAIL_NOTIFICATIONS_LABEL}
        </label>
        <p className="small muted">
          Emails that confirm a consent you gave are always sent, because they are your record.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={announcementsOn}
            disabled={saving}
            onChange={(e) => changeAnnouncements(e.target.checked)}
          />
          {ANNOUNCEMENT_EMAIL_LABEL}
        </label>
        <p className="small muted">
          Leaders choose when to email an announcement. Scouts are never emailed.
        </p>
        <Notice kind="error">{mailError}</Notice>
      </section>
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
              <strong>{CANNOT_UNDO}</strong> If you are the only leader of a troop, you will need to
              invite another leader first.
            </p>
            <div className="row">
              <button type="button" className="btn danger" disabled={busy} onClick={remove}>
                {busy ? 'Deleting…' : 'Yes, permanently delete my account'}
              </button>
              <button
                type="button"
                className="btn quiet"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Keep my account
              </button>
            </div>
            <Notice kind="error">{error}</Notice>
          </>
        ) : (
          <>
            <p className="small">
              This removes your sign-in and your place in your troops. Your Scouts' records stay
              with the troop. To remove a Scout, ask a troop leader to use Remove from troop on the
              Scout's page.
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
