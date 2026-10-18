import { type FormEvent, useState } from 'react';
import { errorMessage } from '../lib/api';
import {
  dateProblem,
  type HealthForm,
  type PartKey,
  PART_LABELS,
  partStatus,
  STATUS_TEXT,
  STATUS_TONE,
  validThrough,
} from '../lib/healthForm';
import { recordHealthForm } from '../lib/healthApi';
import { useHealthForm } from '../lib/healthHooks';
import { useTroop } from '../lib/troop';
import { Field, formatDate, Notice, todayIso } from './ui';
import { healthTip } from '../lib/statusTips';
import { TipPill } from './TipPill';

const HINTS: Record<PartKey, string> = {
  partsAB: 'The date you signed Parts A and B. Good for 12 months.',
  partC: 'The date of the physical. Good for 12 months. Only events that ask for it need Part C.',
};

function recordedLine(form: HealthForm, part: PartKey, nameOf: (id: string) => string): string {
  const p = form[part];
  if (!p) {
    return 'No date recorded.';
  }
  const day = p.at?.toDate?.();
  const iso = day ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` : '';
  const when = iso ? ` on ${formatDate(iso)}` : '';
  return `Dated ${formatDate(p.date)}, good through ${formatDate(validThrough(p.date))}. Recorded by ${nameOf(p.byMemberId)}${when}.`;
}

function PartRow({ troopId, memberId, name, form, part }: { troopId: string; memberId: string; name: string; form: HealthForm; part: PartKey }) {
  const { memberName } = useTroop();
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const status = partStatus(form[part], todayIso());
  const id = `hf-${memberId}-${part}`;
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    const problem = dateProblem(date, todayIso());
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await recordHealthForm({ troopId, memberId, part, date });
      setDate('');
      setDone('Saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <form className="stack" onSubmit={save} noValidate aria-label={`${PART_LABELS[part]} for ${name}`}>
      <h3>
        {PART_LABELS[part]}{' '}
        <TipPill tone={STATUS_TONE[status]} tip={healthTip(part, status)}>
          {STATUS_TEXT[status]}
        </TipPill>
      </h3>
      <p className="small muted">{recordedLine(form, part, memberName)}</p>
      <Field label={`New date for ${PART_LABELS[part]}`} htmlFor={id} hint={HINTS[part]}>
        <input id={id} type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button type="submit" className="btn secondary small">
          Save {PART_LABELS[part]} date
        </button>
      </div>
    </form>
  );
}

/** A person's health form dates: status, who recorded each and when, and a way to record a new date. Dates only. */
export function HealthFormCard({ memberId, name }: { memberId: string; name: string }) {
  const { troopId, isLeader, actingScoutIds, access } = useTroop();
  const allowed = isLeader || actingScoutIds.includes(memberId) || access?.memberId === memberId;
  const live = useHealthForm(memberId, allowed);
  if (!allowed || live.loading) {
    return null;
  }
  const form: HealthForm = live.data ?? { id: memberId };
  return (
    <section className="card stack" aria-label={`Health forms for ${name}`}>
      <h2>Health forms for {name}</h2>
      <p className="small muted">
        Forthright keeps only the dates on the BSA Annual Health and Medical Record. Keep the form itself with you, and do
        not enter medical details here.
      </p>
      <PartRow troopId={troopId} memberId={memberId} name={name} form={form} part="partsAB" />
      <PartRow troopId={troopId} memberId={memberId} name={name} form={form} part="partC" />
    </section>
  );
}
