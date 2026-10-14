import { collection, orderBy, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from './firebase';
import { useQuery } from './hooks';
import { useTroop } from './troop';
import type { Lead, LeadStatus } from './types';

export const LEAD_STATUSES: [LeadStatus, string][] = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['invited', 'Invited'],
  ['joined', 'Joined'],
  ['not_interested', 'Not interested'],
];

export const leadStatusLabel = (status: LeadStatus): string =>
  LEAD_STATUSES.find(([value]) => value === status)?.[1] ?? status;

/** All families who asked about the troop, newest first. Leaders only. */
export function useLeads() {
  const { troopId, isLeader } = useTroop();
  const q = useMemo(
    () => (isLeader ? query(collection(db, 'troops', troopId, 'leads'), orderBy('createdAt', 'desc')) : null),
    [troopId, isLeader],
  );
  return useQuery<Lead>(q, `${troopId}/leads/${isLeader}`);
}

/** How many families are waiting for a first reply. Zero for people who can't see leads. */
export function useNewLeadCount(): number {
  const { troopId, isLeader } = useTroop();
  const q = useMemo(
    () => (isLeader ? query(collection(db, 'troops', troopId, 'leads'), where('status', '==', 'new')) : null),
    [troopId, isLeader],
  );
  return useQuery<Lead>(q, `${troopId}/new-leads/${isLeader}`).data.length;
}
