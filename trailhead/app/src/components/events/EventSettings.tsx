import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import {
  AUDIENCE_LABELS,
  type Audience,
  centsToDollars,
  dollarsToCents,
  type SignupQuestion,
} from '../../lib/eventSignups';
import { db } from '../../lib/firebase';
import type { TroopEvent } from '../../lib/types';
import { Field, Notice } from '../ui';
import { QuestionEditor } from './QuestionEditor';
import { HelpTip } from '../HelpTip';

/** A leader's settings for an event: times, fee and sign-ups. */
export function EventSettings({ troopId, event }: { troopId: string; event: TroopEvent }) {
  const s = event.signups;
  const [enabled, setEnabled] = useState(Boolean(s?.enabled));
  const [audience, setAudience] = useState<Audience>(s?.audience ?? 'both');
  const [capacity, setCapacity] = useState(s?.capacity ? String(s.capacity) : '');
  const [deadline, setDeadline] = useState(s?.deadline ?? '');
  const [needsPermission, setNeedsPermission] = useState(Boolean(s?.needsPermission));
  const [questions, setQuestions] = useState<SignupQuestion[]>(s?.questions ?? []);
  const [fee, setFee] = useState(centsToDollars(event.feeCents));
  const [startTime, setStartTime] = useState(event.startTime ?? '');
  const [endTime, setEndTime] = useState(event.endTime ?? '');
  const [endDate, setEndDate] = useState(event.endDate ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const cents = dollarsToCents(fee);
    const spots = capacity.trim() === '' ? null : Number(capacity);
    if (cents === null) {
      setError('Enter the fee as dollars, such as 25 or 12.50.');
      return;
    }
    if (spots !== null && (!Number.isInteger(spots) || spots < 1)) {
      setError('Enter the number of spots as a whole number, or leave it empty for no limit.');
      return;
    }
    if (endDate && endDate < event.start) {
      setError('The last day can not be before the first day.');
      return;
    }
    const clean = questions.filter((q) => q.label.trim()).map((q) => ({ ...q, label: q.label.trim() }));
    try {
      await updateDoc(doc(db, `troops/${troopId}/events/${event.id}`), {
        feeCents: cents,
        startTime: startTime || deleteField(),
        endTime: endTime || deleteField(),
        endDate: endDate || deleteField(),
        signups: {
          enabled,
          audience,
          capacity: spots,
          deadline: deadline || null,
          needsPermission,
          closed: Boolean(s?.closed),
          questions: clean,
        },
      });
      setQuestions(clean);
      setMessage('Saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={save} noValidate>
      <div className="row">
        <Field label="Start time" htmlFor="es-start">
          <input id="es-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="End time" htmlFor="es-end">
          <input id="es-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
        <Field label="Last day" htmlFor="es-last" hint="For a campout that runs more than one day.">
          <input id="es-last" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Fee per Scout, in dollars" htmlFor="es-fee" hint="Leave empty if there is no fee.">
        <input id="es-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="25" />
      </Field>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Turn on sign-ups
      </label>
      <HelpTip topic="eventSignups" />
      {enabled ? (
        <div className="stack">
          <Field label="Who can sign up" htmlFor="es-audience">
            <select id="es-audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
              {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <div className="row">
            <Field label="Number of spots" htmlFor="es-cap" hint="Empty means no limit. Extra people go on a waitlist.">
              <input id="es-cap" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </Field>
            <Field label="Sign up by" htmlFor="es-deadline" hint="Families can sign up through this day.">
              <input id="es-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={needsPermission} onChange={(e) => setNeedsPermission(e.target.checked)} />
            A parent must give permission for each Scout
          </label>
          <h3>Questions for families</h3>
          <QuestionEditor questions={questions} onChange={setQuestions} />
        </div>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
      <div>
        <button className="btn" type="submit">
          Save settings
        </button>
      </div>
    </form>
  );
}
