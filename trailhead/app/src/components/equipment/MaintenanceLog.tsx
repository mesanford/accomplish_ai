import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { parseCost } from '../../lib/equipmentForm';
import { useMaintenance } from '../../lib/equipmentHooks';
import { db } from '../../lib/firebase';
import { useTroop } from '../../lib/troop';
import { Field, formatDate, Notice, todayIso } from '../ui';

/** Repair notes and history for one item. Quartermaster and leaders only. */
export function MaintenanceLog({ itemId }: { itemId: string }) {
  const { troopId, access } = useTroop();
  const notes = useMaintenance(itemId);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const sorted = [...notes.data].sort((a, b) => b.date.localeCompare(a.date));

  async function add(e: FormEvent) {
    e.preventDefault();
    const cents = parseCost(cost);
    if (!note.trim()) {
      setError('Write what was done or what is wrong.');
      return;
    }
    if (cost.trim() && cents === null) {
      setError('Enter the cost as dollars, like 12.50.');
      return;
    }
    setError('');
    try {
      await addDoc(collection(db, 'troops', troopId, 'maintenance'), {
        itemId,
        kind: 'repair',
        note: note.trim().slice(0, 500),
        date,
        ...(cents === null ? {} : { costCents: cents }),
        byMemberId: access?.memberId ?? '',
        createdAt: serverTimestamp(),
      });
      setNote('');
      setCost('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="stack" aria-label="Repair log">
      <h2 className="blazed">Repair log</h2>
      <form className="form" onSubmit={add}>
        <Field label="Repair note" htmlFor="log-note">
          <input id="log-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Date" htmlFor="log-date">
          <input id="log-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Cost in dollars (optional)" htmlFor="log-cost">
          <input id="log-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Notice kind="error">{error}</Notice>
        <div>
          <button className="btn small" type="submit">
            Add to log
          </button>
        </div>
      </form>
      {sorted.length === 0 ? (
        <p className="muted">No repairs or notes yet.</p>
      ) : (
        <ul className="list">
          {sorted.map((n) => (
            <li key={n.id}>
              <span>
                {n.note}
                <span className="muted small">
                  {' '}
                  · {formatDate(n.date)}
                  {n.costCents === undefined ? '' : ` · $${(n.costCents / 100).toFixed(2)}`}
                </span>
              </span>
              <button
                type="button"
                className="btn quiet small"
                onClick={() => deleteDoc(doc(db, 'troops', troopId, 'maintenance', n.id)).catch((err) => setError(errorMessage(err)))}
              >
                Delete note
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
