import { doc } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { awardName, BADGES, RANKS } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { statusLookup } from '../lib/requirements';
import { SIGNOFF_NOTE } from '../lib/badgeAuthority';
import { recordSignOff } from '../lib/signoff';
import { useTroop } from '../lib/troop';
import type { Progress } from '../lib/types';
import { OfficialLink } from './AwardRequirements';
import { RequirementPicker } from './RequirementPicker';
import { Field, Notice } from './ui';

interface Props {
  troopId: string;
  scoutId: string;
  /** Limit the choice to one award (a counselor signs only their assigned badge). */
  fixedAwardId?: string;
  /** The version the Scout started on, when known. */
  versionId?: string;
  /** A leader signing for a counselor outside the troop: the counselor's name. */
  onBehalfOf?: string;
}

/** Record a signed requirement. The server checks permissions and applies it to the Scout's progress. */
export function SignOffForm({ troopId, scoutId, fixedAwardId, versionId, onBehalfOf }: Props) {
  const { user } = useAuth();
  const { canManageBadges } = useTroop();
  // Leaders who aren't the Scoutmaster or advancement chair sign ranks only; a counselor's form is fixed to their badge.
  const ranksOnly = !fixedAwardId && !canManageBadges;
  const [awardId, setAwardId] = useState(fixedAwardId ?? 'scout');
  const [reqId, setReqId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [round, setRound] = useState(0);
  const progressRef = useMemo(() => doc(db, `troops/${troopId}/progress/${scoutId}_${awardId}`), [troopId, scoutId, awardId]);
  const progress = useDoc<Progress>(progressRef);
  const statuses = useMemo(() => statusLookup(progress.data?.requirements), [progress.data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      return;
    }
    setBusy(true);
    setError('');
    setDone('');
    try {
      await recordSignOff({ troopId, scoutId, awardId, versionId, reqId, signerUid: user.uid, onBehalfOf });
      setDone(`Signed ${awardName(awardId)} requirement ${reqId.trim()}.`);
      setReqId('');
      setRound((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {fixedAwardId ? null : (
        <Field label={ranksOnly ? 'Rank' : 'Rank or merit badge'} htmlFor="so-award">
          <select id="so-award" value={awardId} onChange={(e) => setAwardId(e.target.value)}>
            <optgroup label="Ranks">
              {RANKS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            {ranksOnly ? null : (
              <optgroup label="Merit badges">
                {BADGES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      )}
      {ranksOnly ? (
        <p className="small muted" role="note">
          {SIGNOFF_NOTE}
        </p>
      ) : null}
      <Field label="Requirement" htmlFor="so-req" hint="Choose the requirement that was completed. Signed ones are marked.">
        <RequirementPicker
          key={`${awardId}-${round}`}
          awardId={awardId}
          value={reqId ? [reqId] : []}
          onChange={(v) => setReqId(v[0] ?? '')}
          statuses={statuses}
          inputId="so-req"
        />
      </Field>
      {reqId ? <p className="small">Selected: {reqId}</p> : null}
      <OfficialLink awardId={awardId} />
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy || !reqId.trim()}>
          {busy ? 'Signing…' : 'Sign off requirement'}
        </button>
      </div>
    </form>
  );
}
