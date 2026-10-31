import { collection, doc, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useAuth } from './auth';
import { db } from './firebase';
import { useDoc, useQuery } from './hooks';
import { canPlan, type EventPlan, type Milestone, type PlanOption } from './plans';
import { useTroop } from './troop';

/** What this person may do with plans, from their roles and (for the trip lead) their login. */
export function usePlanAccess() {
  const { isLeader, has } = useTroop();
  const { user } = useAuth();
  const planner = canPlan(isLeader, has);
  const treasurer = has('treasurer');
  return { uid: user?.uid ?? null, planner, treasurer, isLeader, listAll: planner || treasurer };
}

/** The plans this person may list: all of them, or (for anyone else) only those they lead. */
export function usePlans() {
  const { troopId } = useTroop();
  const { uid, listAll } = usePlanAccess();
  const q = useMemo(() => {
    const col = collection(db, `troops/${troopId}/eventPlans`);
    if (listAll) {
      return col;
    }
    return uid ? query(col, where('tripLeadUid', '==', uid)) : null;
  }, [troopId, uid, listAll]);
  return useQuery<EventPlan>(q, `${troopId}/plans/${listAll ? 'all' : uid}`);
}

/** One plan with its options and milestones. */
export function usePlan(planId: string) {
  const { troopId } = useTroop();
  const base = `troops/${troopId}/eventPlans/${planId}`;
  const ref = useMemo(() => doc(db, base), [base]);
  const plan = useDoc<EventPlan>(ref);
  const optionsQ = useMemo(() => collection(db, `${base}/options`), [base]);
  const milestonesQ = useMemo(() => collection(db, `${base}/milestones`), [base]);
  const options = useQuery<PlanOption>(optionsQ, `${base}/options`);
  const milestones = useQuery<Milestone>(milestonesQ, `${base}/milestones`);
  return { plan, options: options.data, milestones: milestones.data };
}
