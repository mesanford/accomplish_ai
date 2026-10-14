import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { awardName, BADGES, badge, RANKS, versionFor } from '../lib/catalog';
import { db } from '../lib/firebase';
import { Field, Notice } from './ui';

interface Props {
  troopId: string;
  scoutId: string;
  /** Limit the choice to one award (a counselor signs only their assigned badge). */
  fixedAwardId?: string;
  /** The version the Scout started on, when known. */
  versionId?: string;
}

/** Record a signed requirement. The server checks permissions and applies it to the Scout's progress. */
export function SignOffForm({ troopId, scoutId, fixedAwardId, versionId }: Props) {
  const { user } = useAuth();
  const [awardId, setAwardId] = useState(fixedAwardId ?? 'scout');
  const [reqId, setReqId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const official = badge(awardId)?.officialUrl;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      return;
    }
    setBusy(true);
    setError('');
    setDone('');
    try {
      await addDoc(collection(db, 'troops', troopId, 'signoffs'), {
        scoutId,
        awardId,
        versionId: versionId ?? versionFor(awardId),
        reqId: reqId.trim(),
        signerUid: user.uid,
        signedAt: serverTimestamp(),
        status: 'pending',
      });
      setDone(`Signed ${awardName(awardId)} requirement ${reqId.trim()}.`);
      setReqId('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {fixedAwardId ? null : (
        <Field label="Rank or merit badge" htmlFor="so-award">
          <select id="so-award" value={awardId} onChange={(e) => setAwardId(e.target.value)}>
            <optgroup label="Ranks">
              {RANKS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Merit badges">
              {BADGES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
      )}
      <Field label="Requirement" htmlFor="so-req" hint="Use the number from the official requirements, such as 4b.">
        <input id="so-req" required maxLength={12} value={reqId} onChange={(e) => setReqId(e.target.value)} />
      </Field>
      {official ? (
        <a className="small" href={official} target="_blank" rel="noreferrer">
          Official {awardName(awardId)} requirements
        </a>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Signing…' : 'Sign off requirement'}
        </button>
      </div>
    </form>
  );
}
