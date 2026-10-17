import { doc, updateDoc } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { KIND_LABELS, KINDS, type ActivityKind } from '../../lib/activity';
import { errorMessage } from '../../lib/api';
import { db } from '../../lib/firebase';
import type { TroopEvent } from '../../lib/types';
import { Field, Notice } from '../ui';

/** A leader sets what each Scout who is marked present earns from this event. The server adds or removes the
 * credits when attendance or these values change. */
export function EventLogFields({ troopId, event }: { troopId: string; event: TroopEvent }) {
  const v = event.logValues ?? {};
  const [kind, setKind] = useState<ActivityKind | ''>(event.logKind ?? '');
  const [nights, setNights] = useState(String(v.nights ?? 0));
  const [hours, setHours] = useState(String(v.serviceHours ?? 0));
  const [miles, setMiles] = useState(String(v.miles ?? 0));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const n = Number(nights || 0);
    const h = Number(hours || 0);
    const m = Number(miles || 0);
    if (!Number.isInteger(n) || n < 0 || n > 60) {
      setError('Nights must be a whole number from 0 to 60.');
      return;
    }
    if (!(h >= 0 && h <= 1000) || !(m >= 0 && m <= 2000)) {
      setError('Service hours and miles must be 0 or more.');
      return;
    }
    try {
      await updateDoc(doc(db, `troops/${troopId}/events/${event.id}`), {
        logKind: kind || 'other',
        logValues: { nights: n, serviceHours: h, miles: m },
      });
      setMessage('Saved. Scouts marked present get these credits.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={save} noValidate>
      <p className="muted small">
        Leave these at 0 if the event is not a campout, service project or hike. When you mark a Scout present, they get
        these credits. If you change them later, every Scout marked present is updated.
      </p>
      <Field label="Kind of activity" htmlFor="log-kind">
        <select id="log-kind" value={kind} onChange={(e) => setKind(e.target.value as ActivityKind | '')}>
          <option value="">Not set</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <div className="row">
        <Field label="Nights camped" htmlFor="log-nights">
          <input id="log-nights" inputMode="numeric" value={nights} onChange={(e) => setNights(e.target.value)} />
        </Field>
        <Field label="Service hours per person" htmlFor="log-hours">
          <input id="log-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label="Miles hiked" htmlFor="log-miles">
          <input id="log-miles" inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} />
        </Field>
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
      <div>
        <button className="btn" type="submit">
          Save activity log
        </button>
      </div>
    </form>
  );
}
