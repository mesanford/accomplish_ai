import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import { type Checkout, CONDITIONS, daysOverdue, isOverdue, type ItemCondition } from '../../lib/equipment';
import { checkInItem } from '../../lib/equipmentApi';
import { LATE_TIP } from '../../lib/equipmentTips';
import { useTroop } from '../../lib/troop';
import { TipPill } from '../TipPill';
import { Field, formatDate, Notice, todayIso } from '../ui';

function CheckIn({ loan, onDone }: { loan: Checkout; onDone: () => void }) {
  const { troopId } = useTroop();
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await checkInItem({ troopId, checkoutId: loan.id, condition, note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit} aria-label={`Check in ${loan.itemName}`}>
      <Field label="Condition now" htmlFor={`in-cond-${loan.id}`}>
        <select id={`in-cond-${loan.id}`} value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)}>
          {CONDITIONS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)" htmlFor={`in-note-${loan.id}`} hint="What was damaged, or what is missing.">
        <input id={`in-note-${loan.id}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Notice kind="error">{error}</Notice>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy}>
          {busy ? 'Checking in…' : 'Check in'}
        </button>
        <button className="btn quiet small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface Props {
  loans: Checkout[];
  /** Show the check-in button. */
  manage: boolean;
  /** Show the item's name as a link (off on the item's own page). */
  showItem?: boolean;
  empty: string;
}

/** What is out, to whom and when it is due, soonest first. Overdue loans are marked and listed first. */
export function LoanList({ loans, manage, showItem = true, empty }: Props) {
  const { troopId } = useTroop();
  const [open, setOpen] = useState<string | null>(null);
  const today = todayIso();
  const sorted = loans
    .filter((c) => c.status === 'out')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.itemName.localeCompare(b.itemName));
  if (sorted.length === 0) {
    return <p className="muted">{empty}</p>;
  }
  return (
    <ul className="list">
      {sorted.map((c) => {
        const late = daysOverdue(c, today);
        return (
          <li key={c.id}>
            <span>
              {showItem ? <Link to={`/t/${troopId}/equipment/${c.itemId}`}>{c.itemName}</Link> : null}
              {showItem ? '' : <strong>{c.toLabel}</strong>}
              {c.itemTag ? <span className="mono"> {c.itemTag}</span> : null}
              {c.quantity > 1 ? ` × ${c.quantity}` : ''}
              <span className="muted small">
                {showItem ? ` · to ${c.toLabel}` : ''}
                {c.toKind === 'event' ? ' (event)' : ''} · due {formatDate(c.dueDate)}
              </span>
            </span>
            <span className="row">
              {isOverdue(c, today) ? (
                <TipPill tone="bad" tip={LATE_TIP}>
                  {late === 1 ? '1 day overdue' : `${late} days overdue`}
                </TipPill>
              ) : null}
              {manage && open !== c.id ? (
                <button type="button" className="btn quiet small" onClick={() => setOpen(c.id)}>
                  Check in {c.itemName}
                </button>
              ) : null}
            </span>
            {open === c.id ? <CheckIn loan={c} onDone={() => setOpen(null)} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
