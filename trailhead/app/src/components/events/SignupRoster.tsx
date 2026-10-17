import { collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { audienceAllows, STATUS_LABELS, type Signup, type SignupStatus } from '../../lib/eventSignups';
import { cancelSignup, signUpForEvent } from '../../lib/eventsApi';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { useTroop } from '../../lib/troop';
import type { TroopEvent } from '../../lib/types';
import { Empty, Notice } from '../ui';

interface Note {
  id: string;
  note: string;
}

const ORDER: SignupStatus[] = ['waiting_permission', 'going', 'waitlist'];

function Row({ signup, event, note, onRemove }: { signup: Signup; event: TroopEvent; note?: string; onRemove: () => void }) {
  const { memberName } = useTroop();
  const name = memberName(signup.memberId);
  const answers = (event.signups?.questions ?? []).filter((q) => signup.answers?.[q.id]);
  return (
    <li>
      <div className="stack" style={{ gap: 2 }}>
        <strong>
          {name} <span className="muted small">{signup.kind === 'scout' ? 'Scout' : 'Adult'}</span>
        </strong>
        {answers.map((q) => (
          <span key={q.id} className="small">
            {q.label}: {signup.answers[q.id]}
          </span>
        ))}
        {note ? <span className="small">Health or emergency note: {note}</span> : null}
        {signup.permission.state === 'approved' && signup.permission.byName ? (
          <span className="muted small">Permission given by {signup.permission.byName}</span>
        ) : null}
      </div>
      <button type="button" className="btn secondary small" onClick={onRemove}>
        Remove {name}
      </button>
    </li>
  );
}

/** What a leader sees: who is going, who still needs permission, the waitlist, answers and notes. */
export function SignupRoster({ troopId, event }: { troopId: string; event: TroopEvent }) {
  const { members, memberName } = useTroop();
  const base = `troops/${troopId}/events/${event.id}`;
  const signupsQ = useMemo(() => collection(db, `${base}/signups`), [base]);
  const notesQ = useMemo(() => collection(db, `${base}/signupNotes`), [base]);
  const signups = useQuery<Signup>(signupsQ, `${base}/signups`);
  const notes = useQuery<Note>(notesQ, `${base}/signupNotes`);
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');
  const settings = event.signups;
  const noteOf = new Map(notes.data.map((n) => [n.id, n.note]));
  const taken = new Set(signups.data.map((s) => s.memberId));
  const addable = members
    .filter((m) => !taken.has(m.id) && settings && audienceAllows(settings.audience, m.kind) && !m.leftAt)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  async function run(task: () => Promise<unknown>) {
    setError('');
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const when = (s: Signup) => s.signedUpAt?.toMillis?.() ?? 0;
  return (
    <div className="stack">
      <Notice kind="error">{error}</Notice>
      {signups.data.length === 0 ? <Empty>No one has signed up yet.</Empty> : null}
      {ORDER.map((status) => {
        const rows = signups.data.filter((s) => s.status === status).sort((a, b) => when(a) - when(b));
        return rows.length === 0 ? null : (
          <section key={status} className="stack" aria-label={STATUS_LABELS[status]}>
            <h3>
              {STATUS_LABELS[status]} ({rows.length})
            </h3>
            <ul className="list">
              {rows.map((s) => (
                <Row
                  key={s.id}
                  signup={s}
                  event={event}
                  note={noteOf.get(s.memberId)}
                  onRemove={() => run(() => cancelSignup({ troopId, eventId: event.id, memberId: s.memberId }))}
                />
              ))}
            </ul>
          </section>
        );
      })}
      <div className="row">
        <select aria-label="Person to add" value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Add a person</option>
          {addable.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn secondary small"
          disabled={!pick}
          onClick={() => run(() => signUpForEvent({ troopId, eventId: event.id, memberId: pick }).then(() => setPick('')))}
        >
          {pick ? `Add ${memberName(pick)}` : 'Add'}
        </button>
      </div>
      <p className="small muted">A Scout you add still needs a parent to give permission if the event asks for it.</p>
    </div>
  );
}
