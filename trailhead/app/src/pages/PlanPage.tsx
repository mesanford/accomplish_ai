import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DecideTab } from '../components/plans/DecideTab';
import { PlanActions } from '../components/plans/PlanActions';
import type { PlanTabProps } from '../components/plans/planProps';
import { PlanTab } from '../components/plans/PlanTab';
import { PublishTab } from '../components/plans/PublishTab';
import { ReadyTab } from '../components/plans/ReadyTab';
import { ResearchTab } from '../components/plans/ResearchTab';
import { ShortlistTab } from '../components/plans/ShortlistTab';
import { PlanStatusChip } from '../components/plans/StatusChip';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';
import { usePlan, usePlanAccess } from '../lib/planAccess';
import { reconcilePlan } from '../lib/plansApi';
import { useTroop } from '../lib/troop';

type TabKey = 'research' | 'shortlist' | 'decide' | 'plan' | 'ready' | 'publish';
const LABELS: Record<TabKey, string> = {
  research: 'Research',
  shortlist: 'Shortlist',
  decide: 'Decide',
  plan: 'Plan',
  ready: 'Ready',
  publish: 'Publish',
};

export function PlanPage() {
  const { planId = '' } = useParams();
  const { troopId } = useTroop();
  const { uid, planner, isLeader, scout } = usePlanAccess();
  const { plan, options, milestones } = usePlan(planId);
  const [tab, setTab] = useState<TabKey>('research');
  const exists = Boolean(plan.data);

  // Brings the plan up to date with its published event, once, when it opens.
  useEffect(() => {
    if (exists) {
      reconcilePlan(troopId, planId).catch(() => undefined);
    }
  }, [troopId, planId, exists]);

  if (plan.loading) {
    return <Loading />;
  }
  if (plan.error) {
    return <Notice kind="error">You do not have access to this plan.</Notice>;
  }
  const p = plan.data;
  if (!p) {
    return <Empty>That plan was not found.</Empty>;
  }
  const canEdit = planner || (uid !== null && p.tripLeadUid === uid);
  const props: PlanTabProps = { troopId, plan: p, options, milestones, canEdit, canShare: canEdit || scout, isLeader };
  const tabs = (Object.keys(LABELS) as TabKey[]).filter((k) => k !== 'publish' || isLeader);
  return (
    <>
      <PageHeader eyebrow="Plan" title={p.title}>
        <PlanStatusChip status={p.status} />
        {isLeader || planner ? (
          <Link className="btn secondary small" to={`/t/${troopId}/events/plans/${p.id}/packet`}>
            Trip packet
          </Link>
        ) : null}
      </PageHeader>
      {scout ? null : <PlanActions troopId={troopId} plan={p} planner={planner} isLeader={isLeader} />}
      <div className="tabs" role="group" aria-label="Plan sections">
        {tabs.map((k) => (
          <button key={k} type="button" className="btn secondary small" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {LABELS[k]}
          </button>
        ))}
      </div>
      {tab === 'research' ? <ResearchTab {...props} /> : null}
      {tab === 'shortlist' ? <ShortlistTab {...props} /> : null}
      {tab === 'decide' ? <DecideTab {...props} /> : null}
      {tab === 'plan' ? <PlanTab {...props} planner={planner} /> : null}
      {tab === 'ready' ? <ReadyTab {...props} /> : null}
      {tab === 'publish' && isLeader ? <PublishTab {...props} /> : null}
    </>
  );
}
