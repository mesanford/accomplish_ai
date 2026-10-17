import { httpsCallable } from 'firebase/functions';
import type { ActivityKind } from './activity';
import { functions } from './firebase';

// Callable wrappers for patrols and activity entries.
async function call<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<In, Out>(functions, name)(data);
  return result.data;
}

export interface PatrolForm {
  troopId: string;
  /** Leave out to create a patrol. */
  patrolId?: string;
  name: string;
  color?: string | null;
  leaderId?: string | null;
  assistantId?: string | null;
}

export const savePatrol = (form: PatrolForm) => call<PatrolForm, { patrolId: string }>('save_patrol', form);

export const assignPatrol = (troopId: string, scoutIds: string[], patrolId: string | null) =>
  call<{ troopId: string; scoutIds: string[]; patrolId: string | null }, { moved: number }>('assign_patrol', {
    troopId,
    scoutIds,
    patrolId,
  });

export const deletePatrol = (troopId: string, patrolId: string) =>
  call<{ troopId: string; patrolId: string }, { deleted: boolean }>('delete_patrol', { troopId, patrolId });

export interface EntryForm {
  troopId: string;
  scoutId: string;
  kind: ActivityKind;
  /** YYYY-MM-DD. */
  date: string;
  nights: number;
  serviceHours: number;
  miles: number;
  note: string;
  eagleProject?: boolean;
}

export const addActivityEntry = (form: EntryForm) =>
  call<EntryForm, { entryId: string; status: 'approved' | 'pending' }>('add_activity_entry', form);

export const reviewActivityEntry = (troopId: string, entryId: string, action: 'approve' | 'reject') =>
  call<{ troopId: string; entryId: string; action: string }, { status: string }>('review_activity_entry', {
    troopId,
    entryId,
    action,
  });

export const deleteActivityEntry = (troopId: string, entryId: string) =>
  call<{ troopId: string; entryId: string }, { deleted: boolean }>('delete_activity_entry', { troopId, entryId });
