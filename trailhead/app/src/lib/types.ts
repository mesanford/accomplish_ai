import type { Timestamp } from 'firebase/firestore';
import type { PublicPage } from './sitePages';

import type { SignupSettings } from './eventSignups';
import type { AccountSettings } from './campaigns';
import type { TroopPayments } from './payments';

export type Role =
  | 'leader'
  | 'scoutmaster'
  | 'advancement'
  | 'counselor'
  | 'committee'
  | 'treasurer'
  | 'parent'
  | 'scout';

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
  /** The public website's state. Written only by the server. */
  site?: { slug?: string; published?: boolean; publishedAt?: Timestamp | null };
  /** The troop's Scout account rules. Written only by save_account_settings. */
  accounts?: Partial<AccountSettings>;
  /** The troop's own Stripe account for card payments. Written only by the server. */
  payments?: TroopPayments;
}

export interface Access {
  memberId: string;
  roles: Role[];
  scoutIds: string[];
  yptExpiresAt?: Timestamp | null;
  /** Scouts a leader linked this parent to, which the parent has not yet agreed to the consent notice for. */
  consentPendingScoutIds?: string[];
}

export interface Member {
  id: string;
  kind: 'adult' | 'scout';
  displayName: string;
  uid?: string;
  roles?: Role[];
  guardianIds?: string[];
  yptExpiresAt?: Timestamp | null;
  /** May photos showing this Scout go on the public website? Written only by set_media_consent. */
  mediaConsent?: { granted: boolean; byMemberId: string; at?: Timestamp };
  /** When a leader marked this Scout as having left the troop. Written only by mark_scout_left. */
  leftAt?: Timestamp | null;
}

/** troops/{t}/consents/{scoutId}: written only by the server. */
export interface ConsentDoc {
  id: string;
  /** One entry per parent who agreed to the notice. */
  parentConsents?: { uid: string; memberId: string; at?: Timestamp; version: string }[];
  /** A leader said the family gave the troop permission (Scouts who may be under 13). */
  leaderConfirmation?: { uid: string; memberId: string; at?: Timestamp };
  /** A parent asked for the Scout's records to be deleted. */
  withdrawal?: { uid: string; memberId: string; at?: Timestamp };
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
  /** A leader signed for this counselor, who is outside the troop. */
  onBehalfOf?: string;
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

export type CardStatus =
  'requested' | 'approved' | 'counselor_assigned' | 'in_progress' | 'complete' | 'cancelled';

export interface BlueCard {
  id: string;
  scoutId: string;
  awardId: string;
  versionId: string;
  status: CardStatus;
  /** A troop member who counsels. Absent when the counselor is outside the troop. */
  counselorUid?: string;
  /** A counselor outside the troop; a leader signs for them. */
  counselorName?: string;
  counselorEmail?: string | null;
  /** Photos or scans of the paper card, as Cloud Storage paths. */
  photoPaths?: string[];
  /** 'paper' for a card recorded from a paper blue card. */
  source?: string;
  startedOn?: string;
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

export interface TemplateItem {
  awardId: string;
  /** Days after the day a Scout applies the template. */
  startOffsetDays: number;
  durationDays: number;
}

export interface PathTemplate {
  id: string;
  name: string;
  description: string;
  goalAwardId: string;
  items: TemplateItem[];
  createdByMemberId: string;
  updatedAt?: Timestamp;
  archived: boolean;
}

export interface TroopEvent {
  id: string;
  title: string;
  start: string;
  logValues?: { nights?: number; miles?: number; serviceHours?: number };
  linkedRequirements?: { awardId: string; reqId: string }[];
  /** Listed on the troop's public website (title, date and place only). */
  public?: boolean;
  place?: string;
  /** Optional last day, and clock times (HH:MM, in the troop's time zone). Used by the calendar feeds. */
  endDate?: string;
  startTime?: string;
  endTime?: string;
  /** Event fee in cents. */
  feeCents?: number;
  /** Sign-up settings (see eventSignups.ts). */
  signups?: SignupSettings;
  /** Written only by the server. */
  signupCounts?: { held: number; going: number; waitingPermission: number; waitlist: number };
  feesPending?: { count: number; amountCents: number };
  feesPosted?: { count: number; amountCents: number };
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

export interface ScoutbookRow {
  scoutId: string;
  scoutName: string;
  kind: 'rank' | 'merit_badge' | 'requirement';
  awardId: string;
  awardName: string;
  requirement?: string;
  date: string;
  signedBy?: string;
}

export interface ScoutbookReport {
  id: string;
  createdAt?: Timestamp;
  since?: Timestamp | null;
  until: Timestamp;
  rows: ScoutbookRow[];
  rowCount: number;
  enteredScoutIds: string[];
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

/** The published troop website, written by the server and readable by anyone. */
export interface PublicSite {
  slug: string;
  troopName: string;
  unitNumber: string;
  council?: string;
  theme?: { color?: string; logoUrl?: string | null };
  cover?: {
    heading?: string;
    tagline?: string;
    photoUrl?: string | null;
    layout?: 'band' | 'centered' | 'split';
  };
  /** A home page banner; the page hides it after endDate. */
  announcement?: { text: string; endDate?: string | null } | null;
  about?: string;
  meeting?: { schedule?: string; place?: string; address?: string | null; mapUrl?: string | null };
  faq?: { q: string; a: string }[];
  contacts?: { name: string; role: string; email?: string | null }[];
  gallery?: { url: string; caption?: string }[];
  events?: { title: string; start: string; place?: string | null }[];
  /** Every upcoming public event (the home page shows the first few). */
  calendar?: { title: string; start: string; place?: string | null }[];
  pages?: PublicPage[];
  documents?: PublicDocument[];
  recruiting?: { open: boolean; intro?: string };
}

export interface PublicDocument {
  id: string;
  title: string;
  category: string;
  fileName: string;
  contentType: string;
  size?: number | null;
  url: string;
}

export type LeadStatus = 'new' | 'contacted' | 'invited' | 'joined' | 'not_interested';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  scoutAge: number | null;
  grade: string | null;
  message: string;
  status: LeadStatus;
  notes: string;
  invitePath?: string;
  createdAt?: Timestamp;
}
