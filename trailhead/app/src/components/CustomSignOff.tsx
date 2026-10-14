import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCustomAwards, useCustomVersion } from '../lib/customAwardsContext';
import { db } from '../lib/firebase';
import type { Progress } from '../lib/types';
import { Empty, Field, Notice } from './ui';

interface Props {
  troopId: string;
  scoutId: string;
  /** The Scout's progress on troop awards, so signatures go to the version they are on. */
  progress: Progress[];
}

/** Leaders sign a troop award requirement by picking it from the award's list. */
export function CustomSignOff({ troopId, scoutId, progress }: Props) {
  const { user } = useAuth();
  const { awards } = useCustomAwards();
  const active = awards.filter((a) => !a.archived);
  const [awardId, setAwardId] = useState('');
  const [reqId, setReqId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const chosen = active.find((a) => a.id === awardId) ?? active[0];
  const started = progress.find((p) => p.awardId === chosen?.id);
  const versionId = started?.versionId ?? chosen?.currentVersionId;
  const version = useCustomVersion(troopId, chosen?.id ?? '', versionId);
  const reqs = version.data?.requirements ?? [];
  const req = reqs.find((r) => r.id === reqId) ?? reqs[0];

  if (active.length === 0) {
    return <Empty>No troop awards yet. Create one on the Troop awards page.</Empty>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || !chosen || !req || !versionId) {
      return;
    }
    setBusy(true);
    setError('');
    setDone('');
    try {
      await addDoc(collection(db, 'troops', troopId, 'signoffs'), {
        scoutId,
        awardId: chosen.id,
        versionId,
        reqId: req.id,
        signerUid: user.uid,
        signedAt: serverTimestamp(),
        status: 'pending',
      });
      setDone(`Signed ${chosen.name} requirement ${req.label}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Troop award" htmlFor="cso-award">
        <select
          id="cso-award"
          value={chosen?.id ?? ''}
          onChange={(e) => {
            setAwardId(e.target.value);
            setReqId('');
          }}
        >
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Troop award requirement" htmlFor="cso-req" hint="Requirements of the version this Scout is on.">
        <select id="cso-req" value={req?.id ?? ''} onChange={(e) => setReqId(e.target.value)}>
          {reqs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}. {r.text.length > 70 ? `${r.text.slice(0, 70)}…` : r.text}
            </option>
          ))}
        </select>
      </Field>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy || !req}>
          {busy ? 'Signing…' : 'Sign troop award requirement'}
        </button>
      </div>
    </form>
  );
}
