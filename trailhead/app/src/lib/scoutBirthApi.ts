import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ScoutBirth {
  troopId: string;
  scoutId: string;
  birthYear: number;
  birthMonth: number;
}

/** A leader sets a Scout's birth month and year. `held` is true if the Scout now waits for a parent's consent. */
export async function setScoutBirth(birth: ScoutBirth): Promise<{ held: boolean }> {
  const result = await httpsCallable<ScoutBirth, { held: boolean }>(functions, 'set_scout_birth')(birth);
  return result.data;
}
