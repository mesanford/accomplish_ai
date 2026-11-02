import { useState } from 'react';
import { errorMessage, isPermissionDenied } from '../lib/api';
import { plannedWithoutCard, requestCard } from '../lib/blueCards';
import { awardName } from '../lib/catalog';
import { useTroop } from '../lib/troop';
import type { BlueCard, PathItemDoc, Progress } from '../lib/types';
import { Notice } from './ui';

/** Badges in the Scout's path plan that don't have a blue card yet, each one click from starting one. */
export function PlannedCards({
  scoutId,
  items,
  cards,
  progress,
}: {
  scoutId: string;
  items: PathItemDoc[];
  cards: BlueCard[];
  progress: Progress[];
}) {
  const { troopId, canManageBadges, actingScoutIds } = useTroop();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const waiting = plannedWithoutCard(items, cards, progress);
  if (waiting.length === 0) {
    return null;
  }
  const mayStart = canManageBadges || actingScoutIds.includes(scoutId);

  async function start(awardId: string) {
    setBusy(awardId);
    setMessage(null);
    try {
      await requestCard(troopId, scoutId, awardId);
      setMessage({ kind: 'ok', text: `Blue card requested for ${awardName(awardId)}. The Scoutmaster or advancement chair will approve it and assign a counselor.` });
    } catch (err) {
      const text = isPermissionDenied(err) ? 'There is already a blue card for this badge.' : errorMessage(err);
      setMessage({ kind: 'error', text });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card stack">
      <h3>In the plan, without a blue card yet</h3>
      <ul className="list">
        {waiting.map((id) => (
          <li key={id}>
            <span>{awardName(id)}</span>
            {mayStart ? (
              <button type="button" className="btn secondary small" disabled={busy !== ''} onClick={() => start(id)}>
                {busy === id ? 'Starting…' : 'Start a blue card'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {mayStart ? null : <p className="muted small">The Scout's family or the Scoutmaster or advancement chair can start these.</p>}
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
    </div>
  );
}
