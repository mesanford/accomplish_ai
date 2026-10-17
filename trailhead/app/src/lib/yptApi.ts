import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/** An adult saves their own Youth Protection expiry date (YYYY-MM-DD) for one troop. */
export async function setMyYpt(troopId: string, yptExpiresAt: string): Promise<void> {
  await httpsCallable<{ troopId: string; yptExpiresAt: string }, { yptExpiresAt: string }>(functions, 'set_my_ypt')({
    troopId,
    yptExpiresAt,
  });
}
