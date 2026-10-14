import { useAwardName } from '../lib/customAwardsContext';
import type { BlueCard, Progress } from '../lib/types';
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
                {signed.length > 0 ? `Signed: ${signed.join(', ')}` : 'Nothing signed yet'}
                {ready.length > 0 ? ` · Ready for sign-off: ${ready.join(', ')}` : ''}
              </span>
            </div>
            {p.status === 'complete' ? (
              <span className="pill good">Complete {formatDate(p.completedAt)}</span>
            ) : (
              <span className="pill neutral">In progress</span>
            )}
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
