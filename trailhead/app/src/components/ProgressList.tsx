import { useAwardName } from '../lib/customAwardsContext';
import { statusLookup } from '../lib/requirements';
import type { BlueCard, Progress } from '../lib/types';
import { RequirementsToggle } from './AwardRequirements';
import { RequirementRefs } from './RequirementRef';
import { CardStatusPill, Empty, formatDate } from './ui';

function signedLabels(p: Progress): string[] {
  return Object.entries(p.requirements ?? {})
    .filter(([, r]) => r.status === 'signed')
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function readyLabels(p: Progress): string[] {
  return Object.entries(p.requirements ?? {})
    .filter(([, r]) => r.status === 'ready')
    .map(([id]) => id);
}

export function ProgressList({ progress }: { progress: Progress[] }) {
  const awardName = useAwardName();
  if (progress.length === 0) {
    return <Empty>No requirements signed yet.</Empty>;
  }
  const sorted = [...progress].sort((a, b) => awardName(a.awardId).localeCompare(awardName(b.awardId)));
  return (
    <ul className="list">
      {sorted.map((p) => {
        const signed = signedLabels(p);
        const ready = readyLabels(p);
        return (
          <li key={p.id}>
            <div className="stack" style={{ gap: 2 }}>
              <strong>{awardName(p.awardId)}</strong>
              <span className="muted small">
                {signed.length > 0 ? (
                  <>
                    Signed: <RequirementRefs awardId={p.awardId} reqIds={signed} />
                  </>
                ) : (
                  'Nothing signed yet'
                )}
                {ready.length > 0 ? (
                  <>
                    {' · '}Ready for sign-off: <RequirementRefs awardId={p.awardId} reqIds={ready} />
                  </>
                ) : null}
              </span>
            </div>
            {p.status === 'complete' ? (
              <span className="pill good">Complete {formatDate(p.completedAt)}</span>
            ) : (
              <span className="pill neutral">In progress</span>
            )}
            <div style={{ flexBasis: '100%' }}>
              <RequirementsToggle awardId={p.awardId} statuses={statusLookup(p.requirements)} label={`${awardName(p.awardId)} requirements`} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function BlueCardList({ cards, counselorName }: { cards: BlueCard[]; counselorName: (uid?: string) => string }) {
  const awardName = useAwardName();
  if (cards.length === 0) {
    return <Empty>No blue cards yet. Start one from the Badges page.</Empty>;
  }
  return (
    <ul className="list">
      {cards.map((c) => (
        <li key={c.id}>
          <div className="stack" style={{ gap: 2 }}>
            <strong>{awardName(c.awardId)}</strong>
            <span className="muted small">Counselor: {counselorName(c.counselorUid)}</span>
          </div>
          <CardStatusPill status={c.status} />
        </li>
      ))}
    </ul>
  );
}
