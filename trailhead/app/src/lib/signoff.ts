import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { versionFor } from './catalog';
import { db } from './firebase';

interface SignOffInput {
  troopId: string;
  scoutId: string;
  awardId: string;
  versionId?: string;
  reqId: string;
  signerUid: string;
}

/** Record a signed requirement. The server checks permissions and applies it to the Scout's progress. */
export async function recordSignOff(input: SignOffInput): Promise<void> {
  await addDoc(collection(db, 'troops', input.troopId, 'signoffs'), {
    scoutId: input.scoutId,
    awardId: input.awardId,
    versionId: input.versionId ?? versionFor(input.awardId),
    reqId: input.reqId.trim(),
    signerUid: input.signerUid,
    signedAt: serverTimestamp(),
    status: 'pending',
  });
}
