// Labels and fixed text for event plans (see plans.ts, which re-exports them).
import type { Availability, CheckStatus, PlanField, PlanKind, PlanStatus } from './plans';

export const KIND_LABELS: Record<PlanKind, string> = {
  campout: 'Campout',
  service: 'Service project',
  highAdventure: 'High adventure',
  other: 'Something else',
};
export const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: 'Planning',
  decided: 'Decided',
  published: 'On the calendar',
  cancelled: 'Cancelled',
  closed: 'Closed',
};
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  unknown: 'Not checked',
  contacted: 'Contacted',
  available: 'Available',
  held: 'Held for us',
  booked: 'Booked',
  unavailable: 'Not available',
};
export const CHECK_LABELS: Record<CheckStatus, string> = {
  pass: 'Ready',
  fail: 'Needs work',
  unknown: 'Missing information',
  acknowledged: 'Acknowledged',
};
export const FIELD_LABELS: Record<PlanField, string> = {
  title: 'Name',
  start: 'First day',
  endDate: 'Last day',
  startTime: 'Start time',
  endTime: 'End time',
  place: 'Place',
  feeCents: 'Fee',
  healthForm: 'Health form',
  logKind: 'Kind of activity',
  logValues: 'Nights, miles and service hours',
  signups: 'Sign-up settings',
};
export const ADVISORY =
  "Forthright is a planning aid. The Guide to Safe Scouting, your council and your chartered organization's rules govern. Verify before you go.";
export const STALE_DAYS = 30;
