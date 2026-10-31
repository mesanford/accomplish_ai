import { Link } from 'react-router-dom';
import { NewPlan } from '../components/plans/NewPlan';
import { PlanFromEvent } from '../components/plans/PlanFromEvent';
import { PlanStatusChip } from '../components/plans/StatusChip';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';
import { daySpan, groupPlans, segmentOf } from '../lib/planForms';
import { usePlanAccess, usePlans } from '../lib/planAccess';
import { type EventPlan, KIND_LABELS, STATUS_LABELS } from '../lib/plans';
import { useTroop } from '../lib/troop';

function dates(p: EventPlan): string {
  const seg = segmentOf(p);
  if (seg.start) {
    return daySpan(seg.start, seg.endDate);
  }
  const w = p.targetWindow;
  return w?.from ? `Aiming for ${daySpan(w.from, w.to)}` : 'No dates yet';
}

export function Plans() {
  const { troopId } = useTroop();
  const { planner, isLeader } = usePlanAccess();
  const plans = usePlans();
  const groups = groupPlans(plans.data);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Plan a trip or event">
        <Link className="btn secondary small" to={`/t/${troopId}/events`}>
          All events
        </Link>
      </PageHeader>
      {plans.loading ? <Loading /> : null}
      <Notice kind="error">{plans.error}</Notice>
      {!plans.loading && groups.length === 0 ? <Empty>No plans yet.</Empty> : null}
      {groups.map(([status, list]) => (
        <section className="stack" key={status} aria-label={STATUS_LABELS[status]}>
          <h2 className="blazed">{STATUS_LABELS[status]}</h2>
          <ul className="list">
            {list.map((p) => (
              <li key={p.id}>
                <div className="stack" style={{ gap: 2 }}>
                  <Link to={`/t/${troopId}/events/plans/${p.id}`}>
                    <strong>{p.title}</strong>
                  </Link>
                  <span className="muted small">
                    {KIND_LABELS[p.kind] ?? 'Other'} · {dates(p)}
                  </span>
                </div>
                <PlanStatusChip status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {planner ? <NewPlan troopId={troopId} /> : null}
      {isLeader ? <PlanFromEvent troopId={troopId} /> : null}
    </>
  );
}
