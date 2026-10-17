import { type FormEvent, useState } from 'react';
import { KIND_LABELS, KINDS, type ActivityKind } from '../../lib/activity';
import { addActivityEntry } from '../../lib/activityApi';
import { errorMessage } from '../../lib/api';
import { stillNeeded } from '../../lib/formCheck';
import { Field, Notice, todayIso } from '../ui';

/** Add an entry the troop didn't schedule, such as an Eagle project or a long-term camp. A leader's entry counts at
 * once. A parent's, or a Scout's own, waits for a leader to approve it. */
export function ManualEntryForm({ troopId, scoutId, leader }: { troopId: string; scoutId: string; leader: boolean }) {
  const [kind, setKind] = useState<ActivityKind>('service');
  const [date, setDate] = useState(todayIso());
  const [nights, setNights] = useState('0');
  const [hours, setHours] = useState('0');
  const [miles, setMiles] = useState('0');
  const [note, setNote] = useState('');
  const [eagle, setEagle] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const missing = stillNeeded([
      ['the date', date],
      ['a short note about what this was', note],
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    try {
      const result = await addActivityEntry({
        troopId,
        scoutId,
        kind,
        date,
        nights: Number(nights || 0),
        serviceHours: Number(hours || 0),
        miles: Number(miles || 0),
        note,
        eagleProject: eagle && kind === 'service',
      });
      setMessage(result.status === 'pending' ? 'Sent. A leader will check it before it counts.' : 'Added.');
      setNote('');
      setNights('0');
      setHours('0');
      setMiles('0');
      setEagle(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate aria-label="Add an entry">
      <div className="row">
        <Field label="Kind" htmlFor="entry-kind">
          <select id="entry-kind" value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" htmlFor="entry-date">
          <input id="entry-date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label="Nights camped" htmlFor="entry-nights">
          <input id="entry-nights" inputMode="numeric" value={nights} onChange={(e) => setNights(e.target.value)} />
        </Field>
        <Field label="Service hours" htmlFor="entry-hours">
          <input id="entry-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label="Miles hiked" htmlFor="entry-miles">
          <input id="entry-miles" inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} />
        </Field>
      </div>
      <Field label="Note" htmlFor="entry-note" hint="What was it? For example, Eagle project or summer camp.">
        <input id="entry-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {kind === 'service' ? (
        <label className="check">
          <input type="checkbox" checked={eagle} onChange={(e) => setEagle(e.target.checked)} />
          This is an Eagle service project
        </label>
      ) : null}
      {leader ? null : <p className="muted small">A leader checks your entry before it counts.</p>}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
      <div>
        <button className="btn" type="submit">
          Add entry
        </button>
      </div>
    </form>
  );
}
