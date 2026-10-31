// Calls to the plan_action function (functions/endpoints/plans.py). Every op takes the troop and, except the
// create ops, the plan. Writes to a plan's options (research cards) go straight to Firestore instead (see
// plansOptions.ts).
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { CheckResult, DiffRow, Milestone, PlanKind, PlanPrivate, PlanSegment, Staffing } from './plans';

async function act<Out>(troopId: string, op: string, data: Record<string, unknown> = {}): Promise<Out> {
  const result = await httpsCallable<Record<string, unknown>, Out>(functions, 'plan_action')({ troopId, op, ...data });
  return result.data;
}

export interface CoreForm {
  title: string;
  kind: PlanKind;
  targetWindow: { from: string | null; to: string | null };
  headcount: { scouts: number; adults: number };
  familyNotes: string;
  packingList: string;
  segments: [Omit<PlanSegment, 'id'>];
}

export interface DecisionForm {
  optionId: string | null;
  rationale: string;
  tally: string;
  reviewOn: string | null;
}

export type MilestoneForm = Pick<Milestone, 'title' | 'anchor' | 'offsetDays' | 'fixedOn' | 'ownerRole' | 'order'>;

export type PublishPreview =
  | { mode: 'create'; event: Record<string, unknown>; venueProblem: string | null }
  | { mode: 'update'; eventId: string; diff: DiffRow[]; venueProblem: string | null };

export const createPlan = (troopId: string, kind: PlanKind, title: string) =>
  act<{ planId: string }>(troopId, 'create_from_template', { kind, title });
export const createPlanFromEvent = (troopId: string, eventId: string) =>
  act<{ planId: string }>(troopId, 'create_from_event', { eventId });
export const clonePlan = (troopId: string, planId: string) => act<{ planId: string }>(troopId, 'clone_plan', { planId });

export const updateCore = (troopId: string, planId: string, core: CoreForm) =>
  act<{ saved: boolean }>(troopId, 'update_core', { planId, core });
export const setStaffing = (troopId: string, planId: string, staffing: Staffing) =>
  act<{ results: CheckResult[] }>(troopId, 'set_staffing', { planId, staffing });
export const setTripLead = (troopId: string, planId: string, memberId: string | null) =>
  act<{ saved: boolean }>(troopId, 'set_trip_lead', { planId, memberId });
export const recordDecision = (troopId: string, planId: string, decision: DecisionForm) =>
  act<{ saved: boolean }>(troopId, 'record_decision', { planId, decision });
export const updatePrivate = (troopId: string, planId: string, fields: PlanPrivate) =>
  act<{ saved: boolean }>(troopId, 'update_private', { planId, private: fields });

export const upsertMilestone = (troopId: string, planId: string, milestone: MilestoneForm, milestoneId?: string) =>
  act<{ milestoneId: string }>(troopId, 'upsert_milestone', { planId, milestone, milestoneId });
export const deleteMilestone = (troopId: string, planId: string, milestoneId: string) =>
  act<{ deleted: boolean }>(troopId, 'delete_milestone', { planId, milestoneId });
export const completeMilestone = (troopId: string, planId: string, milestoneId: string, done: boolean) =>
  act<{ saved: boolean }>(troopId, 'complete_milestone', { planId, milestoneId, done });

export const checkIntent = (troopId: string, planId: string) =>
  act<{ results: CheckResult[] }>(troopId, 'check_intent', { planId });
/** Leaders only. A note is required unless `remove`. */
export const acknowledgeCheck = (troopId: string, planId: string, ruleId: string, note: string, remove = false) =>
  act<{ results: CheckResult[] }>(troopId, 'acknowledge', { planId, ruleId, note, remove });

/** Leaders only. A dry run shows the event to be created, or the field-by-field differences on a re-publish. */
export const previewPublish = (troopId: string, planId: string) =>
  act<PublishPreview>(troopId, 'publish', { planId, dryRun: true });
/** `fields` are the ticked differences on a re-publish (ignored the first time). */
export const publishPlan = (troopId: string, planId: string, fields: string[], confirmedWithVenue: boolean) =>
  act<{ eventId: string; created?: boolean; updated?: string[] }>(troopId, 'publish', {
    planId,
    fields,
    confirmedWithVenue,
  });

export const linkEvent = (troopId: string, planId: string, eventId: string) =>
  act<{ eventId: string }>(troopId, 'link_event', { planId, eventId });
export const unlinkEvent = (troopId: string, planId: string) => act<{ unlinked: boolean }>(troopId, 'unlink_event', { planId });
export const cancelPlan = (troopId: string, planId: string, note: string) =>
  act<{ eventCancelled: boolean }>(troopId, 'cancel_plan', { planId, note });
export const reconcilePlan = (troopId: string, planId: string) =>
  act<{ state: 'live' | 'cancelled' | 'deleted' | null; drift?: string[] }>(troopId, 'reconcile', { planId });
export const closePlan = (troopId: string, planId: string) => act<{ closed: boolean }>(troopId, 'close', { planId });
export const deletePlan = (troopId: string, planId: string) => act<{ deleted: boolean }>(troopId, 'delete_plan', { planId });
