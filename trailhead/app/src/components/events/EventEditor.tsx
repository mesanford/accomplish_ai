import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { MAX_CANCEL_NOTE, whoHears } from '../../lib/eventChanges';
import { db } from '../../lib/firebase';
import { stillNeeded } from '../../lib/formCheck';
import type { TroopEvent } from '../../lib/types';
import { Field, Notice } from '../ui';

/** A leader changes this event's name, date or place, or cancels it. Families hear about a new date or place, or a
 * cancellation, from the server (see functions/endpoints/event_alerts.py). */
export function EventEditor({ troopId, event }: { troopId: string; event: TroopEvent }) {
  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(event.start);
  const [place, setPlace] = useState(event.place ?? '');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const ref = doc(db, `troops/${troopId}/events/${event.id}`);
  const told = whoHears(Boolean(event.signups?.enabled));

  async function run(task: () => Promise<unknown>, done: string) {
    setError('');
    setMessage('');
    try {
      await task();
      setMessage(done);
      setConfirming(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const missing = stillNeeded([
      ["the event's name", title],
      ['the date', start],
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    if (event.endDate && event.endDate < start) {
      setError('The new date is after the last day. Change the last day in the settings below first.');
      return;
    }
    void run(() => updateDoc(ref, { title: title.trim(), start, place: place.trim() }), 'Saved.');
  }

  const cancel = () =>
    run(
      () => updateDoc(ref, { cancelled: true, cancelNote: note.trim() ? note.trim() : deleteField() }),
      'Cancelled.',
    );
  const restore = () => run(() => updateDoc(ref, { cancelled: false, cancelNote: deleteField() }), 'Back on.');

  return (
    <div className="stack">
      <form className="form" onSubmit={save} noValidate>
        <Field label="Event" htmlFor="edit-title">
          <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Date" htmlFor="edit-date">
            <input id="edit-date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Place" htmlFor="edit-place">
            <input id="edit-place" maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} />
          </Field>
        </div>
        <p className="small muted">A new date, time or place: {told}</p>
        <div>
          <button className="btn secondary" type="submit">
            Save changes
          </button>
        </div>
      </form>
      {event.cancelled ? (
        <div className="row">
          <button type="button" className="btn secondary" onClick={() => void restore()}>
            Put this event back on
          </button>
        </div>
      ) : (
        <div className="stack">
          <Field label="Why it's cancelled (optional)" htmlFor="cancel-note" hint="Goes in the email. Not in phone notifications.">
            <input
              id="cancel-note"
              maxLength={MAX_CANCEL_NOTE}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="The church hall is closed this week."
            />
          </Field>
          {confirming ? (
            <div className="row">
              <button type="button" className="btn danger" onClick={() => void cancel()}>
                Yes, cancel and tell families
              </button>
              <button type="button" className="btn secondary" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <div>
              <button type="button" className="btn secondary" onClick={() => setConfirming(true)}>
                Cancel this event
              </button>
            </div>
          )}
          <p className="small muted">{told} Sign-ups and attendance are kept.</p>
        </div>
      )}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
    </div>
  );
}
