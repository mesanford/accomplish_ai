import { addDoc, collection } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { createEventSeries, type RepeatPattern } from '../../lib/eventsApi';
import { db } from '../../lib/firebase';
import { stillNeeded } from '../../lib/formCheck';
import { plural } from '../../lib/plural';
import { MAX_DATES, REPEAT_LABELS, repeatDates, repeatLabel } from '../../lib/recurrence';
import { HelpTip } from '../HelpTip';
import { LogFields } from './EventFormLog';
import { Field, Notice, todayIso } from '../ui';

/** A leader adds one event, or a repeating one such as the weekly troop meeting. */
export function EventForm({ troopId }: { troopId: string }) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(todayIso());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [repeat, setRepeat] = useState<RepeatPattern | 'none'>('none');
  const [until, setUntil] = useState('');
  const [nights, setNights] = useState('0');
  const [miles, setMiles] = useState('0');
  const [hours, setHours] = useState('0');
  const [awardId, setAwardId] = useState('');
  const [reqId, setReqId] = useState('');
  const [place, setPlace] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const repeating = repeat !== 'none';
  const dates = repeating ? repeatDates(repeat, start, until) : [];

  function reset() {
    setTitle('');
    setPlace('');
    setIsPublic(false);
    setReqId('');
    setAwardId('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const missing = stillNeeded([
      ["the event's name", title],
      ['the date', start],
      ...(repeating ? ([['the last date it repeats', until]] as [string, string][]) : []),
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      setError('The end time needs to be after the start time.');
      return;
    }
    const times = { ...(startTime ? { startTime } : {}), ...(endTime ? { endTime } : {}) };
    try {
      if (repeating) {
        const made = await createEventSeries({
          troopId,
          title: title.trim(),
          start,
          until,
          pattern: repeat,
          place: place.trim(),
          public: isPublic,
          ...times,
        });
        setMessage(`Added ${plural(made.count, 'date')}.`);
      } else {
        const linked = awardId && reqId.trim() ? [{ awardId, reqId: reqId.trim() }] : [];
        await addDoc(collection(db, `troops/${troopId}/events`), {
          title: title.trim(),
          start,
          ...times,
          logValues: { nights: Number(nights), miles: Number(miles), serviceHours: Number(hours) },
          linkedRequirements: linked,
          place: place.trim(),
          public: isPublic,
        });
      }
      reset();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Event" htmlFor="ev-title">
        <input id="ev-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="October campout" />
      </Field>
      <div className="row">
        <Field label={repeating ? 'First date' : 'Date'} htmlFor="ev-date">
          <input id="ev-date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Starts (optional)" htmlFor="ev-start-time">
          <input id="ev-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Ends (optional)" htmlFor="ev-end-time">
          <input id="ev-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label="Repeats" htmlFor="ev-repeat">
          <select id="ev-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatPattern | 'none')}>
            {(Object.keys(REPEAT_LABELS) as (RepeatPattern | 'none')[]).map((k) => (
              <option key={k} value={k}>
                {REPEAT_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        {repeating ? (
          <Field label="Until" htmlFor="ev-until" hint={`Up to a year and ${MAX_DATES} dates.`}>
            <input id="ev-until" type="date" value={until} min={start} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        ) : null}
      </div>
      {repeating && dates.length ? (
        <p className="small">
          {repeatLabel(repeat, start)}: {plural(dates.length, 'date')}
          {dates.length > MAX_DATES ? `. That is more than ${MAX_DATES}; choose an earlier last date.` : '.'} Each date
          is its own event, with its own attendance and sign-ups.
        </p>
      ) : null}
      <Field label="Place" htmlFor="ev-place" hint="Optional. Shown on the troop website if the event is listed there.">
        <input id="ev-place" maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Camp Lowden" />
      </Field>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show on the troop website
          <HelpTip topic="publicEvent" />
        </label>
        <span className="hint">Only the event's name, day and place appear there.</span>
      </div>
      {repeating ? (
        <p className="small muted">Set camping nights, miles or a requirement on a single date after adding them.</p>
      ) : (
        <LogFields
          nights={[nights, setNights]}
          miles={[miles, setMiles]}
          hours={[hours, setHours]}
          award={[awardId, setAwardId]}
          req={[reqId, setReqId]}
        />
      )}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
      <div>
        <button className="btn" type="submit">
          {repeating ? 'Add dates' : 'Add event'}
        </button>
      </div>
    </form>
  );
}
