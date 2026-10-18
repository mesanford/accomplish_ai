import { collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { errorMessage } from '../../lib/api';
import {
  audienceAllows,
  permissionText,
  STATUS_LABELS,
  type Signup,
  type SignupStatus,
} from '../../lib/eventSignups';
import { cancelSignup, recordPaperPermission, signUpForEvent } from '../../lib/eventsApi';
import { eventProblems, problemText } from '../../lib/healthForm';
import { useHealthForms } from '../../lib/healthHooks';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { useTroop } from '../../lib/troop';
import type { TroopEvent } from '../../lib/types';
import { Empty, Notice } from '../ui';
import { EVENT_HEALTH_TIP } from '../../lib/statusTips';
import { TipPill } from '../TipPill';

interface Note {
  id: string;
  note: string;
}

const ORDER: SignupStatus[] = ['waiting_permission', 'going', 'waitlist'];

function when(at: { toDate?: () => Date } | undefined): string {
  return at?.toDate
    ? at.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
}

function Row({
  signup,
  event,
  note,
  health,
  onRemove,
  onPaper,
}: {
  signup: Signup;
  event: TroopEvent;
  note?: string;
  health?: string;
  onRemove: () => void;
  onPaper: () => void;
}) {
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
        {health ? (
          <span className="small">
            <TipPill tone="bad" tip={EVENT_HEALTH_TIP}>Health form</TipPill> {health}
          </span>
        ) : null}
        {note ? <span className="small">Health or emergency note: {note}</span> : null}
        {permissionText(signup.permission, when(signup.permission.at)) ? (
          <span className="muted small">
            {permissionText(signup.permission, when(signup.permission.at))}
          </span>
        ) : null}
      </div>
      <div className="row">
        {signup.permission.state === 'pending' ? (
          <button type="button" className="btn secondary small" onClick={onPaper}>
            Record paper slip for {name}
          </button>
        ) : null}
        <button type="button" className="btn secondary small" onClick={onRemove}>
          Remove {name}
        </button>
      </div>
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
  const [onlyMissing, setOnlyMissing] = useState(false);
  const { forms, loading: formsLoading } = useHealthForms();
  const [error, setError] = useState('');
  const settings = event.signups;
  const noteOf = new Map(notes.data.map((n) => [n.id, n.note]));
  const taken = new Set(signups.data.map((s) => s.memberId));
  const addable = members
    .filter(
      (m) => !taken.has(m.id) && settings && audienceAllows(settings.audience, m.kind) && !m.leftAt,
    )
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
  const lastDay = event.endDate || event.start;
  /** What is missing or expired for this event's last day, or '' when nothing is needed or all is in order. */
  const healthOf = (id: string) =>
    event.healthForm && !formsLoading
      ? problemText(eventProblems(event.healthForm, forms.get(id), lastDay))
      : '';
  return (
    <div className="stack">
      <Notice kind="error">{error}</Notice>
      {event.healthForm ? (
        <label className="check">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          Show only people missing a health form
        </label>
      ) : null}
      {signups.data.length === 0 ? <Empty>No one has signed up yet.</Empty> : null}
      {ORDER.map((status) => {
        const rows = signups.data
          .filter((s) => s.status === status && (!onlyMissing || healthOf(s.memberId)))
          .sort((a, b) => when(a) - when(b));
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
                  health={healthOf(s.memberId)}
                  onRemove={() =>
                    run(() => cancelSignup({ troopId, eventId: event.id, memberId: s.memberId }))
                  }
                  onPaper={() =>
                    run(() =>
                      recordPaperPermission({ troopId, eventId: event.id, memberId: s.memberId }),
                    )
                  }
                />
              ))}
            </ul>
          </section>
        );
      })}
      <div className="row">
        <select
          aria-label="Person to add"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          style={{ width: 'auto' }}
        >
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
          onClick={() =>
            run(() =>
              signUpForEvent({ troopId, eventId: event.id, memberId: pick }).then(() =>
                setPick(''),
              ),
            )
          }
        >
          {pick ? `Add ${memberName(pick)}` : 'Add'}
        </button>
      </div>
      <p className="small muted">
        A Scout you add still needs permission if the event asks for it. A parent gives it in the
        app, or you record a signed paper slip.
      </p>
    </div>
  );
}
