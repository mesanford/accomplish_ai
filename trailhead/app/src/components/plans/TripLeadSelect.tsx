import { useState } from 'react';
import { setTripLead } from '../../lib/plansApi';
import { useTroop } from '../../lib/troop';
import { Field, Notice } from '../ui';
import type { PlanTabProps } from './planProps';
import { useAction } from './useAction';

/** Planners pick the adult who leads the trip. That adult can then edit the plan. */
export function TripLeadSelect({ troopId, plan }: PlanTabProps) {
  const { members, memberName } = useTroop();
  const [lead, setLead] = useState(plan.tripLeadMemberId ?? '');
  const act = useAction();
  const candidates = members.filter((m) => m.kind === 'adult' && m.uid);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        void act.run(() => setTripLead(troopId, plan.id, lead || null));
      }}
    >
      <Field label="Trip lead" htmlFor="tl-lead" hint="The trip lead can edit this plan without being a leader.">
        <select id="tl-lead" value={lead} onChange={(e) => setLead(e.target.value)}>
          <option value="">No one yet</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </Field>
      {plan.tripLeadMemberId ? <p className="muted small">Now: {memberName(plan.tripLeadMemberId)}</p> : null}
      <Notice kind="error">{act.error}</Notice>
      <Notice kind="ok">{act.message}</Notice>
      <div>
        <button className="btn secondary" type="submit" disabled={act.busy}>
          Set trip lead
        </button>
      </div>
    </form>
  );
}
