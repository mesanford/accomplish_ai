import { type FormEvent, useState } from 'react';
import { intOrNull } from '../../lib/planForms';
import type { Milestone } from '../../lib/plans';
import type { MilestoneForm as MilestoneValues } from '../../lib/plansApi';
import { Field, Notice } from '../ui';

export const OWNER_LABELS: Record<NonNullable<Milestone['ownerRole']>, string> = {
  leader: 'A leader',
  committee: 'Committee',
  treasurer: 'Treasurer',
  quartermaster: 'Quartermaster',
  tripLead: 'Trip lead',
  patrols: 'Patrols',
};

/** Add or change one milestone: due some days before or after the first day, or on a fixed date. */
export function MilestoneForm({
  milestone,
  nextOrder,
  busy,
  error,
  onSave,
  onCancel,
}: {
  milestone?: Milestone;
  nextOrder: number;
  busy: boolean;
  error: string;
  onSave: (values: MilestoneValues) => void;
  onCancel: () => void;
}) {
  const id = milestone?.id ?? 'new';
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [anchor, setAnchor] = useState<'start' | 'fixed'>(milestone?.anchor ?? 'start');
  const [days, setDays] = useState(String(Math.abs(milestone?.offsetDays ?? 14)));
  const [after, setAfter] = useState((milestone?.offsetDays ?? -14) > 0);
  const [fixedOn, setFixedOn] = useState(milestone?.fixedOn ?? '');
  const [owner, setOwner] = useState<string>(milestone?.ownerRole ?? '');
  const [problem, setProblem] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = intOrNull(days, 1000);
    if (!title.trim()) {
      setProblem('Enter what needs to be done.');
    } else if (anchor === 'fixed' && !fixedOn) {
      setProblem('Choose the date.');
    } else if (anchor === 'start' && (n === undefined || n === null)) {
      setProblem('Enter the number of days as a whole number.');
    } else {
      setProblem('');
      const size = n ?? 0;
      const offset = anchor === 'start' && !after ? -size : size;
      onSave({
        title: title.trim(),
        anchor,
        offsetDays: anchor === 'start' ? offset : 0,
        fixedOn: anchor === 'fixed' ? fixedOn : null,
        ownerRole: (owner || null) as Milestone['ownerRole'],
        order: milestone?.order ?? nextOrder,
      });
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="What needs to be done" htmlFor={`${id}-title`}>
        <input id={`${id}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="row">
        <Field label="Due" htmlFor={`${id}-anchor`}>
          <select id={`${id}-anchor`} value={anchor} onChange={(e) => setAnchor(e.target.value as 'start' | 'fixed')}>
            <option value="start">Relative to the first day</option>
            <option value="fixed">On a fixed date</option>
          </select>
        </Field>
        {anchor === 'start' ? (
          <>
            <Field label="Days" htmlFor={`${id}-days`}>
              <input id={`${id}-days`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
            <Field label="Before or after" htmlFor={`${id}-dir`}>
              <select id={`${id}-dir`} value={after ? 'after' : 'before'} onChange={(e) => setAfter(e.target.value === 'after')}>
                <option value="before">Days before the first day</option>
                <option value="after">Days after the first day</option>
              </select>
            </Field>
          </>
        ) : (
          <Field label="Date" htmlFor={`${id}-fixed`}>
            <input id={`${id}-fixed`} type="date" value={fixedOn} onChange={(e) => setFixedOn(e.target.value)} />
          </Field>
        )}
        <Field label="Who" htmlFor={`${id}-owner`}>
          <select id={`${id}-owner`} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Anyone</option>
            {Object.entries(OWNER_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Notice kind="error">{problem || error}</Notice>
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>
          Save milestone
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
