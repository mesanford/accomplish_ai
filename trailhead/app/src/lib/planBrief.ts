// A plan's trip brief (EventPlan.brief, set through plan_action's update_brief): what the troop is looking for.
// Research cards are checked against it. Mirrors functions/handlers/plans_brief.py.
import { minutesText, money } from './planForms';

export type Lodging = 'tents' | 'cabins' | 'either';
export type Amenity =
  | 'water' | 'toilets' | 'showers' | 'fires' | 'swimming'
  | 'boating' | 'hiking' | 'shelter' | 'accessible' | 'store';

export interface Brief {
  maxDriveMinutes: number | null;
  budgetCents: number | null;
  lodging: Lodging;
  mustHaves: Amenity[];
  notes: string;
}

export const LODGING_LABELS: Record<Lodging, string> = { tents: 'Tents', cabins: 'Cabins or indoors', either: 'Either' };
export const AMENITY_LABELS: Record<Amenity, string> = {
  water: 'Drinking water',
  toilets: 'Toilets',
  showers: 'Showers',
  fires: 'Campfires allowed',
  swimming: 'Swimming',
  boating: 'Boating or paddling',
  hiking: 'Hiking trails',
  shelter: 'Shelter for bad weather',
  accessible: 'Accessible for wheelchairs',
  store: 'A store nearby',
};
export const AMENITIES = Object.keys(AMENITY_LABELS) as Amenity[];

interface Checked {
  costCents?: number | null;
  driveMinutes?: number | null;
  capacity?: number | null;
  amenities?: Amenity[];
}

/** What about a research card doesn't fit the brief, in plain words. Unknown values are not counted against it. */
export function briefProblems(option: Checked, brief: Brief | null | undefined, people: number): string[] {
  if (!brief) {
    return [];
  }
  const out: string[] = [];
  if (brief.budgetCents && option.costCents && option.costCents > brief.budgetCents) {
    out.push(`Over budget: ${money(option.costCents)} a Scout, budget ${money(brief.budgetCents)}`);
  }
  if (brief.maxDriveMinutes && option.driveMinutes && option.driveMinutes > brief.maxDriveMinutes) {
    out.push(`Too far: ${minutesText(option.driveMinutes)}, limit ${minutesText(brief.maxDriveMinutes)}`);
  }
  if (people > 0 && option.capacity && option.capacity < people) {
    out.push(`Too small: room for ${option.capacity}, about ${people} going`);
  }
  const has = new Set(option.amenities ?? []);
  const missing = brief.mustHaves.filter((a) => !has.has(a));
  if (missing.length > 0 && (option.amenities ?? []).length > 0) {
    out.push(`Missing: ${missing.map((a) => AMENITY_LABELS[a].toLowerCase()).join(', ')}`);
  }
  return out;
}

/** Must-haves nobody has said yes or no to yet, to ask the venue about. */
export function toAsk(option: Checked, brief: Brief | null | undefined): Amenity[] {
  if (!brief || (option.amenities ?? []).length > 0) {
    return [];
  }
  return brief.mustHaves;
}
