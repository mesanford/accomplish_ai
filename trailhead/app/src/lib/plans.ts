// Event plans (troops/{t}/eventPlans/{p}): a trip from research to a shortlist, a decision and a plan, before it
// becomes an ordinary event. Only the plan_action function writes a plan; clients write its options (research
// cards). Mirrors functions/handlers/plans_*.py and trailhead_core/plan_checks.py.
import type { Timestamp } from 'firebase/firestore';
import type { Amenity, Brief } from './planBrief';
import type { Role } from './types';

export type PlanKind = 'campout' | 'service' | 'highAdventure' | 'other';
export type PlanStatus = 'draft' | 'decided' | 'published' | 'cancelled' | 'closed';
export type Transport = 'families' | 'carpool' | 'none';
export type Availability = 'unknown' | 'contacted' | 'available' | 'held' | 'booked' | 'unavailable';
export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'acknowledged';
export type PlanField =
  | 'title' | 'start' | 'endDate' | 'startTime' | 'endTime' | 'place'
  | 'feeCents' | 'healthForm' | 'logKind' | 'logValues' | 'signups';

/** The one segment a Phase 1 plan has: it becomes one event. */
export interface PlanSegment {
  id: 's1';
  start: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  place: string;
  logKind: 'campout' | 'service' | 'hike' | 'other';
  logValues: { nights: number; miles: number; serviceHours: number };
  /** The planner marks a resident camp or a destination that asks for Part C. */
  partC: boolean;
  /** Someone confirmed Part C for a trip of exactly 72 hours. */
  healthConfirmed: boolean;
  feeCents: number;
  signups: { enabled: boolean; capacity: number | null; needsPermission: boolean; deadline: string | null };
}

export interface Staffing {
  adultMemberIds: string[];
  adultsFromSignups: boolean;
  transport: Transport | null;
  drivers: { memberId: string; seats: number }[];
  /** The longest day's driving, in minutes. */
  driveMinutes: number;
  attest: { licensed: boolean; seatBelts: boolean };
}

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  message: string;
  required: boolean;
  /** The rule as written, its source and how sure we are of it. */
  text: string;
  sourceUrl: string;
  confidence: 'high' | 'medium' | 'low';
  /** When the rule owner last checked the rule against its source; null until they have. */
  verifiedOn: string | null;
  ack?: { byMemberId: string | null; note: string };
}

export interface EventPlan {
  id: string;
  title: string;
  kind: PlanKind;
  status: PlanStatus;
  targetWindow: { from: string | null; to: string | null };
  headcount: { scouts: number; adults: number };
  familyNotes: string;
  packingList: string;
  segments: PlanSegment[];
  staffing: Staffing;
  decision: {
    optionId: string | null;
    rationale: string;
    tally: string;
    reviewOn: string | null;
    byMemberId: string | null;
    at?: Timestamp;
  } | null;
  /** What the troop is looking for (see planBrief.ts); null until someone answers. */
  brief?: Brief | null;
  tripLeadUid: string | null;
  tripLeadMemberId: string | null;
  eventIds: Record<string, string>;
  intentReadiness?: { results: CheckResult[]; checkedAt?: Timestamp; rulesVersion: string };
  /** What reconcile last found about the published event. */
  eventState?: Record<string, { state: 'live' | 'cancelled' | 'deleted'; drift: PlanField[] }>;
  confirmedWithVenue?: { byMemberId: string | null; at?: Timestamp };
  createdByMemberId: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** A research card (eventPlans/{p}/options/{o}). Planners and the trip lead write these directly. */
export interface PlanOption {
  id: string;
  name: string;
  type?: string;
  /** Up to five. Show only http(s) links (see safeLink). */
  links?: string[];
  costCents?: number | null;
  /** A Google Maps link to the place (see driveTime.ts). */
  mapsUrl?: string;
  driveMinutes?: number | null;
  /** The drive time came from an estimate (OpenRouteService), not typed in. */
  driveEstimated?: boolean;
  capacity?: number | null;
  amenities?: Amenity[];
  bookingOpens?: { date: string | null; note?: string } | null;
  /** A status a person sets, stamped with who and the server's time whenever it changes. */
  availability: { state: Availability; byMemberId: string; at: Timestamp; note?: string };
  pros?: string;
  cons?: string;
  notes?: string;
  pinned: boolean;
  /** Who liked it (member ids), each once. */
  likes?: string[];
  createdByMemberId: string | null;
  createdAt: Timestamp;
}

export interface Milestone {
  id: string;
  title: string;
  anchor: 'start' | 'fixed';
  offsetDays: number;
  fixedOn: string | null;
  ownerRole: 'leader' | 'committee' | 'treasurer' | 'quartermaster' | 'tripLead' | 'patrols' | null;
  order: number;
  /** Worked out by the server; null while the trip has no first day. */
  dueOn: string | null;
  done: { byMemberId: string | null; at?: Timestamp } | null;
}

/** eventPlans/{p}/private/adult: read only when the adult-only panel is opened. */
export interface PlanPrivate {
  contacts: string;
  confirmations: string;
  notes: string;
  /** Helpers and drivers who are not troop members, by name only. */
  helpers: string[];
}

/** planSummaries/{p}: what every member sees on the published event's page. */
export interface PlanSummary {
  title: string;
  eventIds: string[];
  familyNotes: string;
  packingList: string;
}

export interface DiffRow {
  field: PlanField;
  plan: unknown;
  event: unknown;
  /** A leader changed this on the event page since the last publish: re-publishing it undoes their edit. */
  editedOnEvent: boolean;
}

export * from './planLabels';
import { STALE_DAYS } from './planLabels';

/** Planners: leaders and committee members. */
export function canPlan(isLeader: boolean, has: (...roles: Role[]) => boolean): boolean {
  return isLeader || has('committee');
}

/** The link if it is http(s), else null: research links are typed by people and never run as script. */
export function safeLink(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Whole days since a status was set, or null if the time is not known yet (a pending server write). */
export function daysSince(at: Timestamp | undefined | null, now: Date = new Date()): number | null {
  if (!at || typeof at.toDate !== 'function') {
    return null;
  }
  return Math.floor((now.getTime() - at.toDate().getTime()) / 86_400_000);
}

/** True when an availability status is old enough that it should be checked again. */
export function isStale(at: Timestamp | undefined | null, now: Date = new Date()): boolean {
  const days = daysSince(at, now);
  return days !== null && days > STALE_DAYS;
}

export { isOverdue, sortMilestones } from './planMilestones';
