import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rangeText } from '../../lib/isoDate';
import { coreWithDates, datesFromParams, titleFromParams } from '../../lib/planDefaults';
import { KIND_LABELS, type PlanKind } from '../../lib/plans';
import { createPlan, updateCore } from '../../lib/plansApi';
import { Field, Notice } from '../ui';
import { useAction } from './useAction';

/** Planners start a plan from a kind and a name. */
export function NewPlan({ troopId }: { troopId: string }) {
  const [kind, setKind] = useState<PlanKind>('campout');
  const act = useAction();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [title, setTitle] = useState(() => titleFromParams(params));
  const dates = datesFromParams(params);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      act.setError('Enter a name for the plan.');
      return;
    }
    void act.run(async () => {
      const out = await createPlan(troopId, kind, title.trim());
      if (dates) {
        await updateCore(troopId, out.planId, coreWithDates(title.trim(), kind, dates.start, dates.end));
      }
      nav(`/t/${troopId}/events/plans/${out.planId}`);
    }, '');
  }

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <h2>New plan</h2>
      {dates ? <p className="muted">For {rangeText(dates.start, dates.end)}</p> : null}
      <div className="row">
        <Field label="Kind" htmlFor="np-kind">
          <select id="np-kind" value={kind} onChange={(e) => setKind(e.target.value as PlanKind)}>
            {(Object.keys(KIND_LABELS) as PlanKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" htmlFor="np-title">
          <input id="np-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>
      <Notice kind="error">{act.error}</Notice>
      <div>
        <button className="btn" type="submit" disabled={act.busy}>
          Start the plan
        </button>
      </div>
    </form>
  );
}
