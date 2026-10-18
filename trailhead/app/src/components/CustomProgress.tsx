import { useState } from 'react';
import { errorMessage, moveToCustomVersion } from '../lib/api';
import { describeMove } from '../lib/customAwards';
import { useCustomAwards, useCustomVersion } from '../lib/customAwardsContext';
import { AWARD_FINISHED_TIP, REQUIREMENT_TIP } from '../lib/moreStatusTips';
import { useTroop } from '../lib/troop';
import type { CustomRequirement, Progress } from '../lib/types';
import { TipPill } from './TipPill';
import { Empty, formatDate, Notice } from './ui';

const versionNumber = (id: string) => id.replace(/^v/, '');

function RequirementStatus({ req, progress }: { req: CustomRequirement; progress: Progress }) {
  if ((progress.needsReview ?? []).includes(req.id)) {
    return (
      <TipPill tone="warn" tip={REQUIREMENT_TIP.review}>
        Needs review
      </TipPill>
    );
  }
  const state = progress.requirements?.[req.id]?.status;
  if (state === 'signed') {
    return (
      <TipPill tone="good" tip={REQUIREMENT_TIP.signed}>
        Signed
      </TipPill>
    );
  }
  if (state === 'ready') {
    return (
      <TipPill tone="warn" tip={REQUIREMENT_TIP.ready}>
        Ready for sign-off
      </TipPill>
    );
  }
  return null;
}

interface MoveProps {
  progress: Progress;
  latestId: string;
  scoutName: string;
  /** Called with plain sentences about what carried over. The card keeps them after the move re-renders it. */
  onMoved: (lines: string[]) => void;
}

function MoveNotice({ progress, latestId, scoutName, onMoved }: MoveProps) {
  const { troopId, isLeader } = useTroop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function move() {
    setBusy(true);
    setError('');
    try {
      const summary = await moveToCustomVersion({
        troopId,
        scoutId: progress.scoutId,
        awardId: progress.awardId,
        versionId: latestId,
      });
      onMoved([`Moved to version ${versionNumber(summary.toVersionId)}.`, ...describeMove(summary)]);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="notice warn stack" role="status">
      <span>
        {scoutName} is on version {versionNumber(progress.versionId)}. The requirements have changed since: version{' '}
        {versionNumber(latestId)} is the latest.
        {isLeader ? ' Moving keeps every signed requirement whose wording is unchanged.' : ' A leader can move them.'}
      </span>
      {isLeader ? (
        <div>
          <button type="button" className="btn small" disabled={busy} onClick={move}>
            {busy ? 'Moving…' : 'Move to latest version'}
          </button>
        </div>
      ) : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}

function CustomAwardCard({ progress, scoutName }: { progress: Progress; scoutName: string }) {
  const { troopId } = useTroop();
  const { byId } = useCustomAwards();
  const award = byId.get(progress.awardId);
  const version = useCustomVersion(troopId, progress.awardId, progress.versionId);
  const [moved, setMoved] = useState<string[] | null>(null);
  const reqs = version.data?.requirements ?? [];
  const signed = reqs.filter((r) => progress.requirements?.[r.id]?.status === 'signed').length;
  const outdated = award && progress.status !== 'complete' && award.currentVersionId !== progress.versionId;

  return (
    <article className="card" aria-label={award?.name ?? 'Troop award'}>
      <div className="row spread">
        <h3>{award?.name ?? 'Troop award'}</h3>
        {progress.status === 'complete' ? (
          <TipPill tone="good" tip={AWARD_FINISHED_TIP}>
            Complete {formatDate(progress.completedAt)}
          </TipPill>
        ) : (
          <span className="pill neutral">
            {signed} of {reqs.length} signed · Version {versionNumber(progress.versionId)}
          </span>
        )}
      </div>
      {moved ? <Notice kind="ok">{moved.join(' ')}</Notice> : null}
      {outdated ? (
        <MoveNotice progress={progress} latestId={award.currentVersionId} scoutName={scoutName} onMoved={setMoved} />
      ) : null}
      <ul className="list">
        {reqs.map((r) => (
          <li key={r.id}>
            <span>
              <strong>{r.label}.</strong> {r.text}
            </span>
            <RequirementStatus req={r} progress={progress} />
          </li>
        ))}
      </ul>
    </article>
  );
}

/** A Scout's progress on the troop's own awards, with each requirement's wording. */
export function CustomProgress({ progress, scoutName }: { progress: Progress[]; scoutName: string }) {
  if (progress.length === 0) {
    return <Empty>Not working on any troop awards yet.</Empty>;
  }
  return (
    <div className="stack">
      {progress.map((p) => (
        <CustomAwardCard key={p.id} progress={p} scoutName={scoutName} />
      ))}
    </div>
  );
}
