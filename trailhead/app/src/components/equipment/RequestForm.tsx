import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import type { InventoryItem } from '../../lib/equipment';
import { requestItem } from '../../lib/equipmentApi';
import { useEventChoices } from '../../lib/equipmentHooks';
import { useTroop } from '../../lib/troop';
import { Field, Notice } from '../ui';

/** Any member asks for an item for an event. The quartermaster answers; nothing leaves the shelf until they approve. */
export function RequestForm({ item }: { item: InventoryItem }) {
  const { troopId } = useTroop();
  const events = useEventChoices();
  const [eventId, setEventId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const count = Number(quantity);
    if (!eventId) {
      setError('Choose the event.');
      return;
    }
    if (!Number.isInteger(count) || count < 1) {
      setError('Enter how many, as a whole number.');
      return;
    }
    setBusy(true);
    setError('');
    setSent('');
    try {
      await requestItem({ troopId, itemId: item.id, eventId, quantity: count, note: note.trim() || undefined });
      setSent('Request sent. The quartermaster will answer it.');
      setNote('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit} aria-label="Request this item">
      <h2>Request this item</h2>
      <Field label="Event" htmlFor="req-event">
        <select id="req-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Choose an event</option>
          {events.data.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({ev.start})
            </option>
          ))}
        </select>
      </Field>
      {item.quantity > 1 ? (
        <Field label="How many" htmlFor="req-quantity">
          <input id="req-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Note (optional)" htmlFor="req-note">
        <input id="req-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{sent}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </form>
  );
}
