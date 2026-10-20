import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { type SeriesChange, updateEventSeries } from '../../lib/eventsApi';
import { plural } from '../../lib/plural';
import type { EventSeries, TroopEvent } from '../../lib/types';
import { Field, formatDate, Notice } from '../ui';

/** A leader changes or cancels this date of a repeating event and every later one. Families get one email for the
 * whole change. */
export function SeriesEditor({
  troopId,
  event,
  series,
}: {
  troopId: string;
  event: TroopEvent;
  series: EventSeries;
}) {
  const [title, setTitle] = useState(event.title);
  const [place, setPlace] = useState(event.place ?? '');
  const [startTime, setStartTime] = useState(event.startTime ?? '');
  const [endTime, setEndTime] = useState(event.endTime ?? '');
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const base = { troopId, seriesId: series.id, fromEventId: event.id };

  async function send(change: SeriesChange, done: (updated: number) => string) {
    setError('');
    setMessage('');
    try {
      const result = await updateEventSeries(change);
      setMessage(done(result.updated));
      setConfirming(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const changes: NonNullable<SeriesChange['changes']> = {};
    if (title.trim() !== event.title) {
      changes.title = title.trim();
    }
    if (place.trim() !== (event.place ?? '')) {
      changes.place = place.trim();
    }
    if (startTime !== (event.startTime ?? '')) {
      changes.startTime = startTime;
    }
    if (endTime !== (event.endTime ?? '')) {
      changes.endTime = endTime;
    }
    if (Object.keys(changes).length === 0) {
      setError('Change the name, place or a time first.');
      return;
    }
    void send({ ...base, changes }, (n) => `Changed ${plural(n, 'date')}.`);
  }

  return (
    <div className="stack">
      <p className="small">
        {series.label}, {formatDate(series.start)} to {formatDate(series.until)}. Changes here apply to{' '}
        {formatDate(event.start)} and every later date. Families get one email for the whole change.
      </p>
      <form className="form" onSubmit={save} noValidate>
        <div className="row">
          <Field label="Event" htmlFor="series-title">
            <input id="series-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Place" htmlFor="series-place">
            <input id="series-place" maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="Starts" htmlFor="series-start">
            <input id="series-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="series-end">
            <input id="series-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <div>
          <button className="btn secondary" type="submit">
            Change this and later dates
          </button>
        </div>
      </form>
      {confirming ? (
        <div className="row">
          <button
            type="button"
            className="btn danger"
            onClick={() => void send({ ...base, cancel: true }, (n) => `Cancelled ${plural(n, 'date')}.`)}
          >
            Yes, cancel them and tell families
          </button>
          <button type="button" className="btn secondary" onClick={() => setConfirming(false)}>
            Keep them
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="btn secondary" onClick={() => setConfirming(true)}>
            Cancel this and later dates
          </button>
        </div>
      )}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
    </div>
  );
}
