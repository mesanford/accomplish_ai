import { type FormEvent, useState } from 'react';
import { recordDecision } from '../../lib/plansApi';
import { useTroop } from '../../lib/troop';
import { Field, formatDate, Notice } from '../ui';
import type { PlanTabProps } from './planProps';
import { useAction } from './useAction';

/** Record which option the troop chose, why, and when to look at it again. */
export function DecideTab({ troopId, plan, options, canEdit }: PlanTabProps) {
  const { memberName } = useTroop();
  const d = plan.decision;
  const [optionId, setOptionId] = useState(d?.optionId ?? '');
  const [rationale, setRationale] = useState(d?.rationale ?? '');
  const [tally, setTally] = useState(d?.tally ?? '');
  const [reviewOn, setReviewOn] = useState(d?.reviewOn ?? '');
  const act = useAction();
  const chosen = options.find((o) => o.id === d?.optionId);

  function save(e: FormEvent) {
    e.preventDefault();
    void act.run(() =>
      recordDecision(troopId, plan.id, { optionId: optionId || null, rationale, tally, reviewOn: reviewOn || null }),
    );
  }

  return (
    <section className="stack" aria-label="Decision">
      {d ? (
        <div className="card stack">
          <h2>Current decision</h2>
          <p>
            <strong>{chosen ? chosen.name : 'No option chosen'}</strong>
            {d.tally ? ` · ${d.tally}` : ''}
          </p>
          {d.rationale ? <p>{d.rationale}</p> : null}
          <p className="muted small">
            {d.reviewOn ? `Review on ${formatDate(d.reviewOn)}. ` : ''}
            {d.byMemberId ? `Recorded by ${memberName(d.byMemberId)}.` : ''}
          </p>
        </div>
      ) : (
        <p className="muted">No decision yet.</p>
      )}
      {canEdit ? (
        <form className="form" onSubmit={save}>
          <h2>Record the decision</h2>
          <Field label="Chosen option" htmlFor="dc-option">
            <select id="dc-option" value={optionId} onChange={(e) => setOptionId(e.target.value)}>
              <option value="">None yet</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why" htmlFor="dc-why">
            <textarea id="dc-why" value={rationale} maxLength={1000} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <div className="row">
            <Field label="How the vote went" htmlFor="dc-tally" hint="Such as: PLC chose Camp Tesomas, 6-2.">
              <input id="dc-tally" value={tally} maxLength={60} onChange={(e) => setTally(e.target.value)} />
            </Field>
            <Field label="Look at this again on" htmlFor="dc-review">
              <input id="dc-review" type="date" value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} />
            </Field>
          </div>
          <Notice kind="error">{act.error}</Notice>
          <Notice kind="ok">{act.message}</Notice>
          <div>
            <button className="btn" type="submit" disabled={act.busy}>
              Save decision
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
