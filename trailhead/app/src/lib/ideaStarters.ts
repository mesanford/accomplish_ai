// Ideas to put in front of Scouts when a plan starts, picked from what they said they want to do and how long the
// trip is. Kinds of trips, not places: a Scout adds one as an idea, then the troop finds where to do it. Merit
// badges named here are ones in the app's badge list (functions/trailhead_core/content/merit_badges.json).
import type { Interest, TripLength } from './planBrief';
import type { PlanKind } from './plans';

export interface IdeaStarter {
  idea: string;
  interest: Interest;
  /** Trip lengths it suits. */
  lengths: TripLength[];
  /** Merit badges it can help with. */
  badges: string[];
}

const DAY: TripLength[] = ['day'];
const OVERNIGHT: TripLength[] = ['weekend', 'short'];
const ANY: TripLength[] = ['day', 'weekend', 'short', 'week'];

export const IDEAS: IdeaStarter[] = [
  { idea: 'A day hike with a map-and-compass challenge', interest: 'hiking', lengths: DAY, badges: ['Hiking', 'Orienteering'] },
  { idea: 'A backpacking trip, carrying everything in', interest: 'hiking', lengths: [...OVERNIGHT, 'week'], badges: ['Backpacking'] },
  { idea: 'A canoe or kayak trip on a lake or slow river', interest: 'paddling', lengths: ANY, badges: ['Canoeing', 'Kayaking'] },
  { idea: 'A campout by a lake with a fishing contest', interest: 'fishing', lengths: OVERNIGHT, badges: ['Fishing'] },
  { idea: 'A climbing day with a qualified instructor', interest: 'climbing', lengths: DAY, badges: ['Climbing'] },
  { idea: 'A campout at a park with a guarded swimming beach', interest: 'swimming', lengths: OVERNIGHT, badges: ['Swimming'] },
  { idea: 'A bike ride on a rail trail, with a cookout', interest: 'biking', lengths: DAY, badges: ['Cycling'] },
  { idea: 'A bike-in campout', interest: 'biking', lengths: OVERNIGHT, badges: ['Cycling', 'Camping'] },
  { idea: 'A historic site or battlefield, with a campout nearby', interest: 'history', lengths: ANY, badges: ['American Heritage'] },
  { idea: 'A wildlife refuge or nature center, with a bird count', interest: 'nature', lengths: ANY, badges: ['Bird Study', 'Nature'] },
  { idea: 'A park cleanup or trail work day', interest: 'service', lengths: DAY, badges: ['Citizenship in the Community'] },
  { idea: 'A service weekend at a camp that needs help', interest: 'service', lengths: OVERNIGHT, badges: [] },
  { idea: 'A skills campout: cooking, knots and first aid stations', interest: 'skills', lengths: OVERNIGHT, badges: ['Camping', 'Cooking'] },
  { idea: 'A wilderness survival overnight, building shelters', interest: 'skills', lengths: OVERNIGHT, badges: ['Wilderness Survival'] },
  { idea: 'A pioneering day: build a bridge or a tower with rope', interest: 'skills', lengths: DAY, badges: ['Pioneering'] },
];

/** Ideas that fit the answers, at most `limit`. With no interests picked, a mix that fits the trip's length. */
export function ideasFor(kind: PlanKind, interests: Interest[], length: TripLength | null, limit = 6): IdeaStarter[] {
  const wanted = kind === 'service' ? (['service'] as Interest[]) : interests;
  const fitsLength = (i: IdeaStarter) => !length || i.lengths.includes(length);
  const pool = IDEAS.filter(fitsLength).filter((i) => kind === 'service' || i.interest !== 'service');
  const picked = wanted.length ? IDEAS.filter((i) => wanted.includes(i.interest) && fitsLength(i)) : pool;
  return picked.slice(0, limit);
}
