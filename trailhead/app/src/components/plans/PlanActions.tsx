import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EventPlan } from '../../lib/plans';
import { cancelPlan, clonePlan, closePlan, deletePlan } from '../../lib/plansApi';
import { Notice } from '../ui';
import { useAction } from './useAction';

type Step = 'cancel' | 'delete' | null;

/** Clone and close for planners; cancel and delete (with a confirm step on the page) for leaders. */
export function PlanActions({ troopId, plan, planner, isLeader }: { troopId: string; plan: EventPlan; planner: boolean; isLeader: boolean }) {
  const [step, setStep] = useState<Step>(null);
  const [note, setNote] = useState('');
  const act = useAction();
  const nav = useNavigate();
  const base = `/t/${troopId}/events/plans`;
  const open = plan.status !== 'closed' && plan.status !== 'cancelled';

  async function clone() {
    const out = await clonePlan(troopId, plan.id);
    nav(`${base}/${out.planId}`);
  }
  async function remove() {
    await deletePlan(troopId, plan.id);
    nav(base);
  }

  return (
    <div className="stack">
      <div className="row">
        {planner ? (
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => act.run(clone, '')}>
            Clone
          </button>
        ) : null}
        {planner && plan.status !== 'closed' ? (
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => act.run(() => closePlan(troopId, plan.id), 'Closed.')}>
            Close
          </button>
        ) : null}
        {isLeader && open ? (
          <button className="btn secondary small" type="button" onClick={() => setStep('cancel')}>
            Cancel the trip
          </button>
        ) : null}
        {isLeader ? (
          <button className="btn secondary small" type="button" onClick={() => setStep('delete')}>
            Delete
          </button>
        ) : null}
      </div>
      {step === 'cancel' ? (
        <div className="card stack">
          <label htmlFor="pa-note">Note for families (optional). If the event is on the calendar it is cancelled too.</label>
          <input id="pa-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          <div className="row">
            <button className="btn small" type="button" disabled={act.busy} onClick={() => act.run(() => cancelPlan(troopId, plan.id, note), 'Cancelled.')}>
              Yes, cancel it
            </button>
            <button className="btn secondary small" type="button" onClick={() => setStep(null)}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
      {step === 'delete' ? (
        <Notice kind="warn">
          <p>Delete {plan.title}? Its research, milestones and adult-only details are removed. This can not be undone.</p>
          <div className="row">
            <button className="btn small" type="button" disabled={act.busy} onClick={() => act.run(remove, '')}>
              Yes, delete the plan
            </button>
            <button className="btn secondary small" type="button" onClick={() => setStep(null)}>
              Keep it
            </button>
          </div>
        </Notice>
      ) : null}
      <Notice kind="error">{act.error}</Notice>
      <Notice kind="ok">{act.message}</Notice>
    </div>
  );
}
