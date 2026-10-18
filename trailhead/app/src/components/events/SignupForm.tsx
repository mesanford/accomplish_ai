import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import type { SignupSettings } from '../../lib/eventSignups';
import { signUpForEvent } from '../../lib/eventsApi';
import { Field, Notice } from '../ui';

interface Props {
  troopId: string;
  eventId: string;
  memberId: string;
  name: string;
  settings: SignupSettings;
  /** The person filling this in is the Scout's parent, so signing up also gives permission. */
  asParent: boolean;
  waitlistNext: boolean;
}

/** The sign-up form for one person: the leader's questions, and for a parent the permission box and health note. */
export function SignupForm({ troopId, eventId, memberId, name, settings, asParent, waitlistNext }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [permission, setPermission] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const asksPermission = asParent && Boolean(settings.needsPermission);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const missing = (settings.questions ?? []).find((q) => q.required && !answers[q.id]?.trim());
    if (missing) {
      setError(`Answer "${missing.label}".`);
      return;
    }
    if (asksPermission && !permission) {
      setError('Tick the box to give permission for your Scout to go.');
      return;
    }
    setBusy(true);
    try {
      await signUpForEvent({
        troopId,
        eventId,
        memberId,
        answers,
        permission,
        ...(asParent && note.trim() ? { healthNote: note.trim() } : {}),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {waitlistNext ? <p className="small">This event is full. {name} will go on the waitlist.</p> : null}
      {(settings.questions ?? []).map((q) => (
        <Field key={q.id} label={`${q.label}${q.required ? '' : ' (optional)'}`} htmlFor={`${memberId}-${q.id}`}>
          {q.type === 'choice' ? (
            <select
              id={`${memberId}-${q.id}`}
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            >
              <option value="">Choose one</option>
              {(q.choices ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${memberId}-${q.id}`}
              maxLength={200}
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            />
          )}
        </Field>
      ))}
      {asParent ? (
        <Field
          label="Health or emergency note (optional)"
          help="healthNote"
          htmlFor={`${memberId}-note`}
          hint="Only troop leaders can read this. Allergies, medicines, anything a leader should know."
        >
          <textarea id={`${memberId}-note`} maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      ) : null}
      {asksPermission ? (
        <label className="check">
          <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} />
          <span>I give permission for {name} to go to this event.</span>
        </label>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {waitlistNext ? `Join the waitlist for ${name}` : `Sign up ${name}`}
        </button>
      </div>
    </form>
  );
}
