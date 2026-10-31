import { usePlanAccess } from '../../lib/planAccess';
import { PrivatePanel } from './PrivatePanel';
import { CoreForm } from './CoreForm';
import { MilestonesPanel } from './MilestonesPanel';
import type { PlanTabProps } from './planProps';
import { StaffingForm } from './StaffingForm';
import { TripLeadSelect } from './TripLeadSelect';

/** The plan itself: details, adults and drivers, trip lead, milestones and adult-only details. */
export function PlanTab(props: PlanTabProps & { planner: boolean }) {
  const { troopId, plan, canEdit, planner } = props;
  const { treasurer } = usePlanAccess();
  return (
    <div className="stack">
      <div className="card">
        <CoreForm {...props} />
      </div>
      <div className="card">
        <StaffingForm {...props} />
      </div>
      {planner ? (
        <div className="card">
          <TripLeadSelect {...props} />
        </div>
      ) : null}
      <div className="card">
        <MilestonesPanel {...props} />
      </div>
      {canEdit || treasurer ? <PrivatePanel troopId={troopId} planId={plan.id} canEdit={canEdit} /> : null}
    </div>
  );
}
