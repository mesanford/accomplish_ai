// Starting a blue card, and which badges in a Scout's path plan don't have one yet.
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { BADGE_VERSION, badge } from './catalog';
import { db } from './firebase';
import type { BlueCard, PathItemDoc, Progress } from './types';

/** Ask for a blue card (status "requested"). The rules allow one card per Scout and badge, and only the Scoutmaster,
 * the advancement chair or the Scout's own family may ask. */
export async function requestCard(troopId: string, scoutId: string, awardId: string): Promise<void> {
  await setDoc(doc(db, `troops/${troopId}/blueCards/${scoutId}_${awardId}`), {
    scoutId,
    awardId,
    versionId: BADGE_VERSION,
    status: 'requested',
    requestedAt: serverTimestamp(),
  });
}

/** Merit badges in the plan with no blue card yet and not already earned, in the plan's order. Ranks and troop
 * awards don't use blue cards. */
export function plannedWithoutCard(items: PathItemDoc[], cards: BlueCard[], progress: Progress[]): string[] {
  const carded = new Set(cards.map((c) => c.awardId));
  const earned = new Set(progress.filter((p) => p.status === 'complete').map((p) => p.awardId));
  const ids = items.map((i) => i.awardId).filter((id, i, all) => all.indexOf(id) === i);
  return ids.filter((id) => Boolean(badge(id)) && !carded.has(id) && !earned.has(id));
}
