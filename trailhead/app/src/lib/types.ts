import type { Timestamp } from 'firebase/firestore';

export type Role = 'leader' | 'advancement' | 'counselor' | 'committee' | 'parent' | 'scout';

export interface Membership {
  name: string;
  unitNumber: string;
  memberId: string;
  roles: Role[];
}

export interface UserDoc {
  troops?: Record<string, Membership>;
}

export interface Troop {
  name: string;
  unitNumber: string;
  council?: string;
}

export interface Access {
  memberId: string;
  roles: Role[];
  scoutIds: string[];
  yptExpiresAt?: Timestamp | null;
}

export interface Member {
  id: string;
  kind: 'adult' | 'scout';
  displayName: string;
  uid?: string;
  roles?: Role[];
  guardianIds?: string[];
  yptExpiresAt?: Timestamp | null;
}

export interface ScoutRecord {
  birthYear: number;
  birthMonth: number;
  currentRankId: string;
  rankDates: Record<string, string>;
}

export interface RequirementState {
  status: 'ready' | 'signed';
  signoffId?: string;
}

export interface Progress {
  id: string;
  scoutId: string;
  awardId: string;
  versionId: string;
  status: 'in_progress' | 'complete';
  completedAt?: string;
  requirements?: Record<string, RequirementState>;
  /** Custom awards: requirement ids a leader should re-check after moving the Scout to a newer version. */
  needsReview?: string[];
}

export type CardStatus = 'requested' | 'approved' | 'counselor_assigned' | 'in_progress' | 'complete' | 'cancelled';

export interface BlueCard {
  id: string;
  scoutId: string;
  awardId: string;
  versionId: string;
  status: CardStatus;
  counselorUid?: string;
}

export interface PathItemDoc {
  awardId: string;
  plannedStart?: string;
  plannedEnd?: string;
}

export interface Issue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  award_id?: string | null;
}

export interface Feasibility {
  status: 'ok' | 'at_risk' | 'infeasible';
  issues: Issue[];
  earliest_goal_date?: string | null;
  next_steps?: string[];
}

export interface PathDoc {
  scoutId: string;
  goalAwardId: string;
  targetDate?: string;
  items: PathItemDoc[];
  feasibility?: Feasibility;
}

export interface TroopEvent {
  id: string;
  title: string;
  start: string;
  logValues?: { nights?: number; miles?: number; serviceHours?: number };
  linkedRequirements?: { awardId: string; reqId: string }[];
}

export interface Thread {
  id: string;
  memberIds: string[];
  participantUids: string[];
  lastMessage?: string;
  lastSenderMemberId?: string;
  updatedAt?: Timestamp;
}

export interface Message {
  id: string;
  senderMemberId: string;
  body: string;
  createdAt?: Timestamp;
}

export interface CustomRequirement {
  id: string;
  label: string;
  text: string;
}

/** A troop-made award. Ids start with "custom-". Requirements live in its versions. */
export interface CustomAward {
  id: string;
  name: string;
  description?: string;
  currentVersionId: string;
  archived?: boolean;
  createdByMemberId?: string;
  createdAt?: Timestamp;
}

export interface CustomAwardVersion {
  id: string;
  requirements: CustomRequirement[];
  note?: string;
  createdByMemberId?: string;
  createdAt?: Timestamp;
}
