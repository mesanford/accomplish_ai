import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { normalizeReqId } from '../lib/requirements';
import { recordSignOff } from '../lib/signoff';
import { useRequirements } from '../lib/useRequirements';
import { OfficialLink } from './AwardRequirements';
import { type ReqStatus, RequirementList } from './RequirementList';
import { SignOffForm } from './SignOffForm';
import { Notice } from './ui';

interface Props {
  troopId: string;
  scoutId: string;
  awardId: string;
  versionId?: string;
  statuses: Record<string, ReqStatus>;
}

/** The badge's full requirement list with a Sign button on each; falls back to typing a number. */
export function CounselChecklist({ troopId, scoutId, awardId, versionId, statuses }: Props) {
  const { user } = useAuth();
  const { doc, loading } = useRequirements(awardId);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function sign(reqId: string) {
    if (!user) {
      return;
    }
    setBusy(reqId);
    setError('');
    try {
      await recordSignOff({ troopId, scoutId, awardId, versionId, reqId, signerUid: user.uid });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return <p className="small muted">Loading requirements…</p>;
  }
  if (!doc) {
    return <SignOffForm troopId={troopId} scoutId={scoutId} fixedAwardId={awardId} versionId={versionId} />;
  }
  return (
    <div className="stack">
      <RequirementList
        doc={doc}
        statuses={statuses}
        collapsedCount={40}
        action={(r) =>
          statuses[normalizeReqId(r.id)] === 'signed' ? null : (
            <button
              type="button"
              className="btn small"
              aria-label={`Sign requirement ${r.id}`}
              disabled={busy === r.id}
              onClick={() => sign(r.id)}
            >
              {busy === r.id ? 'Signing…' : 'Sign'}
            </button>
          )
        }
      />
      <Notice kind="error">{error}</Notice>
      <OfficialLink awardId={awardId}>Check against the official requirements first</OfficialLink>
    </div>
  );
}
