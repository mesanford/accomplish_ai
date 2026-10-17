import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { closedReason, permissionText, STATUS_LABELS, type Signup } from '../../lib/eventSignups';
import { approvePermission, cancelSignup } from '../../lib/eventsApi';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/hooks';
import { useTroop } from '../../lib/troop';
import type { TroopEvent } from '../../lib/types';
import { Field, Notice, todayIso } from '../ui';
import { EventHealth } from './EventHealth';
import { SignupForm } from './SignupForm';

function when(at: { toDate?: () => Date } | undefined): string {
  return at?.toDate ? at.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

/** A parent gives permission for their Scout, with an optional note only leaders read. */
function Permission({ troopId, eventId, signup, name }: { troopId: string; eventId: string; signup: Signup; name: string }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const pending = signup.permission.state === 'pending';
  async function approve() {
    setError('');
    setDone('');
    try {
      await approvePermission({ troopId, eventId, memberId: signup.memberId, ...(note.trim() ? { healthNote: note.trim() } : {}) });
      setDone(pending ? 'Permission recorded.' : 'Note saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <div className="stack">
      <Field
        label={`Health or emergency note for ${name} (optional)`}
        htmlFor={`note-${signup.memberId}`}
        hint="Only troop leaders can read this."
      >
        <textarea id={`note-${signup.memberId}`} maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button type="button" className={pending ? 'btn' : 'btn secondary small'} onClick={approve} disabled={!pending && !note.trim()}>
          {pending ? `Give permission for ${name}` : 'Save note'}
        </button>
      </div>
    </div>
  );
}

interface Props {
  troopId: string;
  event: TroopEvent;
  memberId: string;
  name: string;
  /** Spots are full, so a new sign-up goes on the waitlist. */
  full: boolean;
}

/** One person's sign-up on the event page: their status, or the form to sign them up. */
export function PersonSignup({ troopId, event, memberId, name, full }: Props) {
  const { parentOf, isLeader } = useTroop();
  const ref = useMemo(() => doc(db, `troops/${troopId}/events/${event.id}/signups/${memberId}`), [troopId, event.id, memberId]);
  const live = useDoc<Signup>(ref);
  const [error, setError] = useState('');
  const settings = event.signups;
  if (!settings || live.loading) {
    return null;
  }
  const signup = live.data;
  async function cancel() {
    setError('');
    try {
      await cancelSignup({ troopId, eventId: event.id, memberId });
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const asParent = parentOf(memberId);
  const closed = isLeader ? '' : closedReason(settings, event.start, todayIso());
  return (
    <section className="card stack" aria-label={`Sign-up for ${name}`}>
      <h3>{name}</h3>
      <EventHealth event={event} memberId={memberId} />
      {signup ? (
        <>
          <p>
            <span className={`pill ${signup.status === 'going' ? 'good' : 'warn'}`}>{STATUS_LABELS[signup.status]}</span>
          </p>
          {permissionText(signup.permission, when(signup.permission.at)) ? (
            <p className="small muted">{permissionText(signup.permission, when(signup.permission.at))}</p>
          ) : null}
          {signup.status === 'waitlist' ? <p className="small">You will get an email if a spot opens up.</p> : null}
          {asParent && signup.permission.state !== 'not_needed' ? (
            <Permission troopId={troopId} eventId={event.id} signup={signup} name={name} />
          ) : null}
          <Notice kind="error">{error}</Notice>
          <div>
            <button type="button" className="btn secondary small" onClick={cancel}>
              Cancel sign-up for {name}
            </button>
          </div>
        </>
      ) : closed ? (
        <p className="muted">{closed}</p>
      ) : (
        <SignupForm
          troopId={troopId}
          eventId={event.id}
          memberId={memberId}
          name={name}
          settings={settings}
          asParent={asParent}
          waitlistNext={full}
        />
      )}
    </section>
  );
}
