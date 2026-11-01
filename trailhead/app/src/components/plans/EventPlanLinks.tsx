import { Link } from 'react-router-dom';
import { usePlanAccess } from '../../lib/planAccess';

/** On an event made from a plan: links to the plan and to the trip packet, for those who may open them. */
export function EventPlanLinks({ troopId, planId }: { troopId: string; planId: string }) {
  const { planner, treasurer, isLeader } = usePlanAccess();
  if (!planner && !treasurer) {
    return null;
  }
  return (
    <div className="row no-print">
      <Link to={`/t/${troopId}/events/plans/${planId}`}>Planned in Forthright: open the plan</Link>
      {isLeader ? <Link to={`/t/${troopId}/events/plans/${planId}/packet`}>Trip packet</Link> : null}
    </div>
  );
}
