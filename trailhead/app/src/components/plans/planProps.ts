import type { EventPlan, Milestone, PlanOption } from '../../lib/plans';

/** What every plan tab gets from the plan page. */
export interface PlanTabProps {
  troopId: string;
  plan: EventPlan;
  options: PlanOption[];
  milestones: Milestone[];
  /** Planners and the plan's trip lead. */
  canEdit: boolean;
  isLeader: boolean;
}
