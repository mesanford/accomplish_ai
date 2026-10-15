import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { errorMessage, isPermissionDenied } from '../lib/api';
import { START_CARD_NOTE } from '../lib/badgeAuthority';
import { BADGE_VERSION, type Badge } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useTroop } from '../lib/troop';
import { Notice } from './ui';

/** Asks for a blue card. The first Scout is chosen once the roster has loaded, never before. */
export function StartCard({ b }: { b: Badge }) {
  const { troopId, members, visibleScoutIds, actingScoutIds, canManageBadges, isLeader } = useTroop();
  // The Scoutmaster and advancement chair start cards for any Scout; everyone else only for Scouts they are family of.
  const mayStart = canManageBadges ? visibleScoutIds : actingScoutIds;
  const scouts = members.filter((m) => mayStart.includes(m.id));
  const [picked, setPicked] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  if (scouts.length === 0) {
    return isLeader ? <p className="small muted">{START_CARD_NOTE}</p> : null;
  }
  // Derived each render: a stale or empty pick falls back to the first Scout on the loaded roster.
  const scoutId = scouts.find((s) => s.id === picked)?.id ?? scouts[0].id;

  async function start() {
    setMessage(null);
    if (!scoutId) {
      setMessage({ kind: 'error', text: 'Choose a Scout first.' });
      return;
    }
    try {
      await setDoc(doc(db, `troops/${troopId}/blueCards/${scoutId}_${b.id}`), {
        scoutId,
        awardId: b.id,
        versionId: BADGE_VERSION,
        status: 'requested',
        requestedAt: serverTimestamp(),
      });
      setMessage({ kind: 'ok', text: 'Blue card requested. The Scoutmaster or advancement chair will approve it and assign a counselor.' });
    } catch (err) {
      // The rules refuse a second card for the same Scout and badge, which looks like a permission error.
      const text = isPermissionDenied(err) ? 'There is already a blue card for this badge.' : errorMessage(err);
      setMessage({ kind: 'error', text });
    }
  }

  return (
    <div className="stack">
      <div className="row">
        {scouts.length > 1 ? (
          <select aria-label="Scout" value={scoutId} onChange={(e) => setPicked(e.target.value)} style={{ width: 'auto' }}>
            {scouts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="btn secondary small" onClick={start} disabled={!scoutId}>
          Start a blue card
        </button>
      </div>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
    </div>
  );
}
