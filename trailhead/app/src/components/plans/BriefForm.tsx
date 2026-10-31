import { type FormEvent, useState } from 'react';
import { centsToDollars } from '../../lib/eventSignups';
import { AMENITY_LABELS, type Amenity, type Brief, LODGING_LABELS, type Lodging } from '../../lib/planBrief';
import { centsOrNull, intOrNull, minutesText, money } from '../../lib/planForms';
import type { EventPlan } from '../../lib/plans';
import { updateBrief } from '../../lib/plansApi';
import { Field, Notice } from '../ui';
import { AmenityPicker } from './AmenityPicker';
import { useAction } from './useAction';

/** The brief in one line each, once it has been answered. */
function Summary({ brief, kind }: { brief: Brief; kind: EventPlan['kind'] }) {
  return (
    <ul className="small">
      <li>Longest drive: {brief.maxDriveMinutes ? minutesText(brief.maxDriveMinutes) : 'No limit set'}</li>
      <li>Budget per Scout: {brief.budgetCents ? money(brief.budgetCents) : 'No limit set'}</li>
      {kind === 'campout' ? <li>Sleeping: {LODGING_LABELS[brief.lodging]}</li> : null}
      <li>Must have: {brief.mustHaves.length ? brief.mustHaves.map((a) => AMENITY_LABELS[a]).join(', ') : 'Nothing set'}</li>
      {brief.notes ? <li>{brief.notes}</li> : null}
    </ul>
  );
}

/** "What are you looking for?": asked before research, so every option can be checked against it. */
export function BriefForm({ troopId, plan, canEdit }: { troopId: string; plan: EventPlan; canEdit: boolean }) {
  const b = plan.brief;
  const [editing, setEditing] = useState(!b);
  const [drive, setDrive] = useState(b?.maxDriveMinutes?.toString() ?? '');
  const [budget, setBudget] = useState(centsToDollars(b?.budgetCents));
  const [lodging, setLodging] = useState<Lodging>(b?.lodging ?? 'either');
  const [mustHaves, setMustHaves] = useState<Amenity[]>(b?.mustHaves ?? []);
  const [notes, setNotes] = useState(b?.notes ?? '');
  const [problem, setProblem] = useState('');
  const act = useAction();

  async function save(e: FormEvent) {
    e.preventDefault();
    const maxDriveMinutes = intOrNull(drive, 1440);
    const budgetCents = centsOrNull(budget);
    if (maxDriveMinutes === undefined) {
      setProblem('Enter the longest drive as whole minutes, such as 120.');
      return;
    }
    if (budgetCents === undefined) {
      setProblem('Enter the budget as dollars, such as 40 or 12.50.');
      return;
    }
    setProblem('');
    const brief: Brief = { maxDriveMinutes, budgetCents, lodging, mustHaves, notes: notes.trim() };
    if (await act.run(() => updateBrief(troopId, plan.id, brief))) {
      setEditing(false);
    }
  }

  if (!canEdit || (b && !editing)) {
    return (
      <section className="card stack" aria-label="What you're looking for">
        <h2>What you're looking for</h2>
        {b ? <Summary brief={b} kind={plan.kind} /> : <p className="muted">The planners haven't said yet.</p>}
        {canEdit ? (
          <div>
            <button className="btn secondary small" type="button" onClick={() => setEditing(true)}>
              Change
            </button>
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <form className="card form" aria-label="What you're looking for" onSubmit={save} noValidate>
      <h2>What are you looking for?</h2>
      <p className="muted small">A few answers before you start. Every option you add is checked against them.</p>
      <div className="row">
        <Field label="Longest drive, in minutes" htmlFor="br-drive" hint="From your meeting place. Empty means no limit.">
          <input id="br-drive" inputMode="numeric" value={drive} onChange={(e) => setDrive(e.target.value)} />
        </Field>
        <Field label="Budget per Scout, in dollars" htmlFor="br-budget" hint="Empty means no limit.">
          <input id="br-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
      </div>
      {plan.kind === 'campout' ? (
        <fieldset className="stack">
          <legend>Sleeping</legend>
          {(Object.keys(LODGING_LABELS) as Lodging[]).map((l) => (
            <label key={l} className="check">
              <input type="radio" name="br-lodging" checked={lodging === l} onChange={() => setLodging(l)} />
              {LODGING_LABELS[l]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <AmenityPicker legend="Must have" value={mustHaves} onChange={setMustHaves} />
      <Field label="Anything else (optional)" htmlFor="br-notes" hint="Such as: the younger Scouts' first campout.">
        <textarea id="br-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Notice kind="error">{problem || act.error}</Notice>
      <div className="row">
        <button className="btn" type="submit" disabled={act.busy}>
          Save
        </button>
        {b ? (
          <button className="btn secondary" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
