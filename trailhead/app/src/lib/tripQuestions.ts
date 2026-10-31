// The questions a plan starts with, one at a time, in words a Scout would use. Each answer becomes part of the
// plan's brief (planBrief.ts), which picks ideas and checks every option.
import {
  AMENITY_LABELS,
  type Amenity,
  type Brief,
  DRIVE_CHOICES,
  INTEREST_LABELS,
  type Interest,
  LODGING_LABELS,
  type Lodging,
  SEASON_LABELS,
  type Season,
  TRIP_LENGTH_LABELS,
  type TripLength,
} from './planBrief';
import type { PlanKind } from './plans';

export type StepKey = 'length' | 'season' | 'drive' | 'interests' | 'lodging' | 'mustHaves' | 'budget';
export type Answers = Partial<Record<StepKey, string[]>>;

export interface Step {
  key: StepKey;
  question: string;
  hint?: string;
  multi: boolean;
  choices: [string, string][];
}

/** Budget choices in cents per Scout; "unsure" is no limit. */
const BUDGETS: [string, string][] = [
  ['2500', 'Under $25'],
  ['5000', 'Up to $50'],
  ['10000', 'Up to $100'],
  ['25000', 'Up to $250'],
  ['unsure', 'More, or not sure yet'],
];

const entries = <K extends string>(labels: Record<K, string>) => Object.entries(labels) as [K, string][];

const ALL: Step[] = [
  { key: 'length', question: 'How long is the trip?', multi: false, choices: entries(TRIP_LENGTH_LABELS) },
  { key: 'season', question: 'When do you want to go?', multi: false, choices: entries(SEASON_LABELS) },
  {
    key: 'drive',
    question: 'How far can you drive to get there?',
    hint: 'From where the troop meets.',
    multi: false,
    choices: DRIVE_CHOICES.map(([m, label]) => [m === null ? 'any' : String(m), label]),
  },
  {
    key: 'interests',
    question: 'What do you want to do?',
    hint: 'Pick as many as you like.',
    multi: true,
    choices: entries(INTEREST_LABELS),
  },
  { key: 'lodging', question: 'Where do you want to sleep?', multi: false, choices: entries(LODGING_LABELS) },
  {
    key: 'mustHaves',
    question: "Anything you can't do without?",
    hint: 'Skip this if nothing matters much.',
    multi: true,
    choices: entries(AMENITY_LABELS),
  },
  { key: 'budget', question: 'About how much can each Scout pay?', multi: false, choices: BUDGETS },
];

/** The questions for this kind of trip: no sleeping question for a day or a service project, no must-haves for
 * service. */
export function stepsFor(kind: PlanKind, answers: Answers): Step[] {
  const day = answers.length?.[0] === 'day';
  return ALL.filter((s) => {
    if (s.key === 'lodging') {
      return !day && kind !== 'service';
    }
    if (s.key === 'mustHaves') {
      return kind !== 'service';
    }
    return true;
  });
}

/** The answers already in a brief, so changing them starts from what was said. */
export function answersFrom(brief: Brief | null | undefined): Answers {
  if (!brief) {
    return {};
  }
  return {
    length: brief.tripLength ? [brief.tripLength] : [],
    season: brief.season ? [brief.season] : [],
    drive: [brief.maxDriveMinutes ? String(brief.maxDriveMinutes) : 'any'],
    interests: brief.interests,
    lodging: [brief.lodging],
    mustHaves: brief.mustHaves,
    budget: [brief.budgetCents ? String(brief.budgetCents) : 'unsure'],
  };
}

/** The brief from the answers. Anything not asked or skipped keeps what the brief had. */
export function briefFrom(answers: Answers, prior: Brief | null | undefined): Brief {
  const one = (k: StepKey) => answers[k]?.[0];
  const number = (raw: string | undefined) => (raw && /^\d+$/.test(raw) ? Number(raw) : null);
  return {
    tripLength: (one('length') as TripLength | undefined) ?? prior?.tripLength ?? null,
    season: (one('season') as Season | undefined) ?? prior?.season ?? null,
    maxDriveMinutes: answers.drive ? number(one('drive')) : (prior?.maxDriveMinutes ?? null),
    interests: (answers.interests as Interest[] | undefined) ?? prior?.interests ?? [],
    lodging: (one('lodging') as Lodging | undefined) ?? prior?.lodging ?? 'either',
    mustHaves: (answers.mustHaves as Amenity[] | undefined) ?? prior?.mustHaves ?? [],
    budgetCents: answers.budget ? number(one('budget')) : (prior?.budgetCents ?? null),
    notes: prior?.notes ?? '',
  };
}
