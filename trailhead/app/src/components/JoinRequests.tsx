import { useState } from 'react';
import { answerJoinRequest, errorMessage } from '../lib/api';
import { CREATOR_CHOICES, DEFAULT_CREATOR_ROLE } from '../lib/creatorRole';
import { useJoinRequests } from '../lib/joinRequests';
import { useTroop } from '../lib/troop';
import type { JoinRequest } from '../lib/types';
import { formatDate, Notice } from './ui';

const isoOf = (at?: { toDate(): Date } | null) => (at ? at.toDate().toISOString() : null);

function RequestRow({ request }: { request: JoinRequest }) {
  const { troopId } = useTroop();
  const [role, setRole] = useState(request.creatorRole || DEFAULT_CREATOR_ROLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roleId = `join-role-${request.id}`;

  async function answer(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      await answerJoinRequest(troopId, request.uid, approve, approve ? role : undefined);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <li className="stack">
      <div>
        <strong>{request.displayName}</strong>{' '}
        <span className="small muted">
          {request.email} · asked {formatDate(isoOf(request.requestedAt))} · training expires{' '}
          {formatDate(isoOf(request.yptExpiresAt))}
        </span>
      </div>
      <div className="row" style={{ alignItems: 'end' }}>
        <label htmlFor={roleId} className="small">
          Role
          <select id={roleId} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
            {CREATOR_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn small" disabled={busy} onClick={() => answer(true)}>
          Approve {request.displayName}
        </button>
        <button type="button" className="btn quiet small" disabled={busy} onClick={() => answer(false)}>
          Decline
        </button>
      </div>
      <Notice kind="error">{error}</Notice>
    </li>
  );
}

/** Requests to join, for leaders to approve or decline. Shows nothing when there are none. */
export function JoinRequests() {
  const requests = useJoinRequests();
  if (requests.length === 0) {
    return null;
  }
  return (
    <section className="card stack" aria-label="Asking to join">
      <h2>Asking to join ({requests.length})</h2>
      <p className="muted small">
        These people found the troop on Forthright and asked to join. Approve only people you know are part of the
        troop. Approving adds them with the role you pick; you can change roles later on this page.
      </p>
      <ul className="list">
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} />
        ))}
      </ul>
    </section>
  );
}
