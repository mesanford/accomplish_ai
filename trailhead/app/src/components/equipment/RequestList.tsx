import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import type { EquipmentRequest } from '../../lib/equipment';
import { decideRequest } from '../../lib/equipmentApi';
import { REQUEST_TIP } from '../../lib/equipmentTips';
import { useTroop } from '../../lib/troop';
import { TipPill } from '../TipPill';
import { formatDate, Notice } from '../ui';

const TONES = { pending: 'warn', approved: 'good', declined: 'neutral' } as const;
const WORDS = { pending: 'Waiting', approved: 'Approved', declined: 'Declined' } as const;

function Answer({ request }: { request: EquipmentRequest }) {
  const { troopId } = useTroop();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function answer(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      await decideRequest({ troopId, requestId: request.id, approve });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <>
      <span className="row">
        <button type="button" className="btn small" disabled={busy} onClick={() => answer(true)}>
          Approve {request.itemName}
        </button>
        <button type="button" className="btn quiet small" disabled={busy} onClick={() => answer(false)}>
          Decline {request.itemName}
        </button>
      </span>
      <Notice kind="error">{error}</Notice>
    </>
  );
}

/** Requests for an event. The quartermaster and leaders approve or decline (approving checks the item out to the
 * event, due the day after it ends); everyone else sees the answers to their own. */
export function RequestList({ requests, manage }: { requests: EquipmentRequest[]; manage: boolean }) {
  const { troopId } = useTroop();
  const sorted = [...requests].sort(
    (a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0),
  );
  if (sorted.length === 0) {
    return <p className="muted">{manage ? 'No requests yet.' : 'You have not asked for anything yet. Open an item to request it for an event.'}</p>;
  }
  return (
    <ul className="list">
      {sorted.map((r) => (
        <li key={r.id}>
          <span>
            <Link to={`/t/${troopId}/equipment/${r.itemId}`}>{r.itemName}</Link>
            {r.quantity > 1 ? ` × ${r.quantity}` : ''}
            <span className="muted small">
              {' '}
              · for {r.eventTitle}
              {r.eventStart ? `, ${formatDate(r.eventStart)}` : ''}
              {manage ? ` · from ${r.requestedByName}` : ''}
              {r.note ? ` · "${r.note}"` : ''}
            </span>
          </span>
          {manage && r.status === 'pending' ? <Answer request={r} /> : (
            <TipPill tone={TONES[r.status]} tip={REQUEST_TIP[r.status]}>
              {WORDS[r.status]}
            </TipPill>
          )}
        </li>
      ))}
    </ul>
  );
}
