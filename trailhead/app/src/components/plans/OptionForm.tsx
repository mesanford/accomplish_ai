import { type FormEvent, useState } from 'react';
import { centsToDollars } from '../../lib/eventSignups';
import { badLink, centsOrNull, intOrNull, linksFromText } from '../../lib/planForms';
import { AVAILABILITY_LABELS, type Availability, type PlanOption } from '../../lib/plans';
import type { OptionForm as OptionValues } from '../../lib/plansOptions';
import { Field, Notice } from '../ui';

const STATES = Object.keys(AVAILABILITY_LABELS) as Availability[];

/** Add or edit one research card. `onSave` gets clean values; a problem is shown here and nothing is sent. */
export function OptionForm({
  option,
  busy,
  error,
  onSave,
  onCancel,
}: {
  option?: PlanOption;
  busy: boolean;
  error: string;
  onSave: (values: OptionValues) => void;
  onCancel: () => void;
}) {
  const id = option?.id ?? 'new';
  const [name, setName] = useState(option?.name ?? '');
  const [type, setType] = useState(option?.type ?? '');
  const [links, setLinks] = useState((option?.links ?? []).join('\n'));
  const [cost, setCost] = useState(centsToDollars(option?.costCents));
  const [drive, setDrive] = useState(option?.driveMinutes?.toString() ?? '');
  const [capacity, setCapacity] = useState(option?.capacity?.toString() ?? '');
  const [opens, setOpens] = useState(option?.bookingOpens?.date ?? '');
  const [opensNote, setOpensNote] = useState(option?.bookingOpens?.note ?? '');
  const [state, setState] = useState<Availability>(option?.availability.state ?? 'unknown');
  const [note, setNote] = useState(option?.availability.note ?? '');
  const [pros, setPros] = useState(option?.pros ?? '');
  const [cons, setCons] = useState(option?.cons ?? '');
  const [notes, setNotes] = useState(option?.notes ?? '');
  const [problem, setProblem] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const list = linksFromText(links);
    const costCents = centsOrNull(cost);
    const driveMinutes = intOrNull(drive, 1440);
    const cap = intOrNull(capacity, 10000);
    if (!name.trim()) {
      setProblem('Enter a name for this option.');
    } else if (list.length > 5) {
      setProblem('Add up to 5 links.');
    } else if (badLink(list)) {
      setProblem('Links must start with http:// or https://.');
    } else if (costCents === undefined) {
      setProblem('Enter the cost as dollars, such as 25 or 12.50.');
    } else if (driveMinutes === undefined) {
      setProblem('Enter the drive time as whole minutes, up to 1440.');
    } else if (cap === undefined) {
      setProblem('Enter the capacity as a whole number, or leave it empty.');
    } else {
      setProblem('');
      onSave({
        name,
        type,
        links: list,
        costCents,
        driveMinutes,
        capacity: cap,
        bookingOpens: { date: opens || null, note: opensNote },
        availability: { state, note },
        pros,
        cons,
        notes,
      });
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="row">
        <Field label="Name" htmlFor={`${id}-name`}>
          <input id={`${id}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Kind of place" htmlFor={`${id}-type`} hint="Such as camp, state park or museum.">
          <input id={`${id}-type`} value={type} maxLength={40} onChange={(e) => setType(e.target.value)} />
        </Field>
      </div>
      <Field label="Links, one per line" htmlFor={`${id}-links`} hint="Up to 5. Web pages only.">
        <textarea id={`${id}-links`} value={links} onChange={(e) => setLinks(e.target.value)} />
      </Field>
      <div className="row">
        <Field label="Cost per Scout, in dollars" htmlFor={`${id}-cost`}>
          <input id={`${id}-cost`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Drive time, in minutes" htmlFor={`${id}-drive`}>
          <input id={`${id}-drive`} inputMode="numeric" value={drive} onChange={(e) => setDrive(e.target.value)} />
        </Field>
        <Field label="Capacity" htmlFor={`${id}-cap`}>
          <input id={`${id}-cap`} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label="Booking opens" htmlFor={`${id}-opens`}>
          <input id={`${id}-opens`} type="date" value={opens} onChange={(e) => setOpens(e.target.value)} />
        </Field>
        <Field label="About booking" htmlFor={`${id}-opens-note`}>
          <input id={`${id}-opens-note`} value={opensNote} maxLength={200} onChange={(e) => setOpensNote(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label="Availability" htmlFor={`${id}-state`}>
          <select id={`${id}-state`} value={state} onChange={(e) => setState(e.target.value as Availability)}>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {AVAILABILITY_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who you talked to or when" htmlFor={`${id}-note`}>
          <input id={`${id}-note`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <Field label="Pros" htmlFor={`${id}-pros`}>
        <textarea id={`${id}-pros`} value={pros} maxLength={1000} onChange={(e) => setPros(e.target.value)} />
      </Field>
      <Field label="Cons" htmlFor={`${id}-cons`}>
        <textarea id={`${id}-cons`} value={cons} maxLength={1000} onChange={(e) => setCons(e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor={`${id}-notes`}>
        <textarea id={`${id}-notes`} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Notice kind="error">{problem || error}</Notice>
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>
          Save option
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
