import { type FormEvent, useState } from 'react';
import { centsToDollars } from '../../lib/eventSignups';
import { centsOrNull, intOrNull, segmentOf } from '../../lib/planForms';
import { KIND_LABELS, type PlanKind } from '../../lib/plans';
import { type CoreForm as CoreValues, updateCore } from '../../lib/plansApi';
import { Field, Notice } from '../ui';
import type { PlanTabProps } from './planProps';
import { SignupFields } from './SignupFields';
import { useAction } from './useAction';

const num = (n: number | null | undefined) => (n ? String(n) : '');

/** The plan's name, dates, place, fee, sign-up settings and notes for families. */
export function CoreForm({ troopId, plan, canEdit }: PlanTabProps) {
  const seg = segmentOf(plan);
  const [title, setTitle] = useState(plan.title);
  const [kind, setKind] = useState<PlanKind>(plan.kind);
  const [from, setFrom] = useState(plan.targetWindow?.from ?? '');
  const [to, setTo] = useState(plan.targetWindow?.to ?? '');
  const [scouts, setScouts] = useState(num(plan.headcount?.scouts));
  const [adults, setAdults] = useState(num(plan.headcount?.adults));
  const [start, setStart] = useState(seg.start ?? '');
  const [endDate, setEndDate] = useState(seg.endDate ?? '');
  const [startTime, setStartTime] = useState(seg.startTime ?? '');
  const [endTime, setEndTime] = useState(seg.endTime ?? '');
  const [place, setPlace] = useState(seg.place);
  const [fee, setFee] = useState(centsToDollars(seg.feeCents));
  const [nights, setNights] = useState(num(seg.logValues.nights));
  const [miles, setMiles] = useState(num(seg.logValues.miles));
  const [hours, setHours] = useState(num(seg.logValues.serviceHours));
  const [signups, setSignups] = useState({
    enabled: seg.signups.enabled,
    capacity: num(seg.signups.capacity),
    needsPermission: seg.signups.needsPermission,
    deadline: seg.signups.deadline ?? '',
  });
  const [partC, setPartC] = useState(seg.partC);
  const [healthConfirmed, setHealthConfirmed] = useState(seg.healthConfirmed);
  const [familyNotes, setFamilyNotes] = useState(plan.familyNotes ?? '');
  const [packingList, setPackingList] = useState(plan.packingList ?? '');
  const [problem, setProblem] = useState('');
  const act = useAction();

  function save(e: FormEvent) {
    e.preventDefault();
    const feeCents = centsOrNull(fee);
    const cap = intOrNull(signups.capacity, 500);
    const n = { s: intOrNull(scouts, 500), a: intOrNull(adults, 200), nights: intOrNull(nights, 60), miles: intOrNull(miles, 2000), hours: intOrNull(hours, 1000) };
    if (feeCents === undefined) {
      setProblem('Enter the fee as dollars, such as 25 or 12.50.');
    } else if (cap === undefined || Object.values(n).includes(undefined)) {
      setProblem('Enter counts as whole numbers.');
    } else if (endDate && start && endDate < start) {
      setProblem('The last day can not be before the first day.');
    } else {
      setProblem('');
      const core: CoreValues = {
        title,
        kind,
        targetWindow: { from: from || null, to: to || null },
        headcount: { scouts: n.s ?? 0, adults: n.a ?? 0 },
        familyNotes,
        packingList,
        segments: [
          {
            ...seg,
            start: start || null,
            endDate: endDate || null,
            startTime: startTime || null,
            endTime: endTime || null,
            place,
            feeCents: feeCents ?? 0,
            logValues: { nights: n.nights ?? 0, miles: n.miles ?? 0, serviceHours: n.hours ?? 0 },
            signups: { enabled: signups.enabled, capacity: cap, needsPermission: signups.needsPermission, deadline: signups.deadline || null },
            partC,
            healthConfirmed,
          },
        ],
      };
      void act.run(() => updateCore(troopId, plan.id, core));
    }
  }

  return (
    <form className="form" onSubmit={save} noValidate>
      <fieldset className="stack" disabled={!canEdit}>
        <legend>The plan</legend>
        <div className="row">
          <Field label="Name" htmlFor="pc-title">
            <input id="pc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Kind" htmlFor="pc-kind">
            <select id="pc-kind" value={kind} onChange={(e) => setKind(e.target.value as PlanKind)}>
              {(Object.keys(KIND_LABELS) as PlanKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Aiming for, from" htmlFor="pc-from" hint="A rough window while you research.">
            <input id="pc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Aiming for, to" htmlFor="pc-to">
            <input id="pc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Scouts expected" htmlFor="pc-scouts">
            <input id="pc-scouts" inputMode="numeric" value={scouts} onChange={(e) => setScouts(e.target.value)} />
          </Field>
          <Field label="Adults expected" htmlFor="pc-adults">
            <input id="pc-adults" inputMode="numeric" value={adults} onChange={(e) => setAdults(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="First day" htmlFor="pc-start">
            <input id="pc-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Last day" htmlFor="pc-end" hint="Leave empty for a one-day event.">
            <input id="pc-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Start time" htmlFor="pc-st">
            <input id="pc-st" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="End time" htmlFor="pc-et">
            <input id="pc-et" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Place" htmlFor="pc-place">
          <input id="pc-place" value={place} onChange={(e) => setPlace(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Fee per Scout, in dollars" htmlFor="pc-fee">
            <input id="pc-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
          <Field label="Nights" htmlFor="pc-nights">
            <input id="pc-nights" inputMode="numeric" value={nights} onChange={(e) => setNights(e.target.value)} />
          </Field>
          <Field label="Miles" htmlFor="pc-miles">
            <input id="pc-miles" inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value)} />
          </Field>
          <Field label="Service hours" htmlFor="pc-hours">
            <input id="pc-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
        </div>
        <SignupFields value={signups} onChange={setSignups} />
        <label className="check">
          <input type="checkbox" checked={partC} onChange={(e) => setPartC(e.target.checked)} />
          Part C needed (resident camp or destination asks)
        </label>
        <label className="check">
          <input type="checkbox" checked={healthConfirmed} onChange={(e) => setHealthConfirmed(e.target.checked)} />
          Confirm Part C for exactly 72 hours
        </label>
        <Field label="Notes for families" htmlFor="pc-notes" hint="Families see this on the event page.">
          <textarea id="pc-notes" value={familyNotes} onChange={(e) => setFamilyNotes(e.target.value)} />
        </Field>
        <Field label="Packing list" htmlFor="pc-pack" hint="Families see this on the event page.">
          <textarea id="pc-pack" value={packingList} onChange={(e) => setPackingList(e.target.value)} />
        </Field>
      </fieldset>
      <Notice kind="error">{problem || act.error}</Notice>
      <Notice kind="ok">{act.message}</Notice>
      {canEdit ? (
        <div>
          <button className="btn" type="submit" disabled={act.busy}>
            Save the plan
          </button>
        </div>
      ) : null}
    </form>
  );
}
