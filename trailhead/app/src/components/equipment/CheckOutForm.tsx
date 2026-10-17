import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { available, checkOutProblem, type InventoryItem } from '../../lib/equipment';
import { checkOutItem } from '../../lib/equipmentApi';
import { useEventChoices } from '../../lib/equipmentHooks';
import { useTroop } from '../../lib/troop';
import { Field, Notice, todayIso } from '../ui';

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lend the item to a person or to an event, with a due date. */
export function CheckOutForm({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const { troopId, members } = useTroop();
  const events = useEventChoices();
  const single = item.quantity === 1;
  const [kind, setKind] = useState<'member' | 'event'>('member');
  const [memberId, setMemberId] = useState('');
  const [eventId, setEventId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [dueDate, setDueDate] = useState(inDays(7));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const people = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const count = single ? 1 : Number(quantity);
    const problem = checkOutProblem(item, count) ?? (kind === 'member' && !memberId ? 'Choose who has it.' : null) ?? (kind === 'event' && !eventId ? 'Choose the event.' : null);
    if (problem) {
      setError(problem);
      return;
    }
    if (dueDate < todayIso()) {
      setError("The due date can't be in the past.");
      return;
    }
    setBusy(true);
    setError('');
    try {
      await checkOutItem({
        troopId,
        itemId: item.id,
        quantity: count,
        dueDate,
        note: note.trim() || undefined,
        ...(kind === 'member' ? { memberId } : { eventId }),
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit} aria-label="Check out">
      <h2>Check out</h2>
      <Field label="Check out to" htmlFor="out-kind">
        <select id="out-kind" value={kind} onChange={(e) => setKind(e.target.value as 'member' | 'event')}>
          <option value="member">A person</option>
          <option value="event">An event</option>
        </select>
      </Field>
      {kind === 'member' ? (
        <Field label="Person" htmlFor="out-member">
          <select id="out-member" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Choose a person</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
                {m.kind === 'scout' ? ' (Scout)' : ''}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Event" htmlFor="out-event">
          <select id="out-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Choose an event</option>
            {events.data.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({ev.start})
              </option>
            ))}
          </select>
        </Field>
      )}
      {single ? null : (
        <Field label="How many" htmlFor="out-quantity" hint={`${available(item)} on the shelf.`}>
          <input id="out-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      )}
      <Field label="Due back" htmlFor="out-due">
        <input id="out-due" type="date" value={dueDate} min={todayIso()} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="out-note">
        <input id="out-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Notice kind="error">{error}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Checking out…' : 'Check out'}
        </button>
      </div>
    </form>
  );
}
