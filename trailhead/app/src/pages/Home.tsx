import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Empty, Notice, PageHeader } from '../components/ui';
import { cancelJoinRequest, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { PendingJoin } from '../lib/types';

function Waiting({ troopId, join }: { troopId: string; join: PendingJoin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await cancelJoinRequest(troopId);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <div className="card stack">
      <h2>{join.name}</h2>
      <p className="muted small">
        Unit {join.unitNumber} · You asked to join. Waiting for one of the troop's leaders to approve you.
      </p>
      <Notice kind="error">{error}</Notice>
      <div>
        <button type="button" className="btn quiet small" disabled={busy} onClick={cancel}>
          Cancel request
        </button>
      </div>
    </div>
  );
}

/** Lists the person's troops and the troops they asked to join. With exactly one troop, goes straight to it. */
export function Home() {
  const { profile } = useAuth();
  const troops = Object.entries(profile?.troops ?? {});
  const waiting = Object.entries(profile?.joinRequests ?? {});
  if (troops.length === 1 && waiting.length === 0) {
    return <Navigate to={`/t/${troops[0][0]}`} replace />;
  }
  return (
    <>
      <PageHeader eyebrow="Forthright" title="Your troops">
        <Link className="btn" to="/create">
          Create a troop
        </Link>
      </PageHeader>
      {troops.length === 0 && waiting.length === 0 ? (
        <Empty>
          You're not in a troop yet. If your troop already uses Forthright, ask one of its leaders for an invite link
          and open it. If you're not sure, press Create a troop: when you enter your unit number and council, we show
          any troop that's already here so you can ask to join it.
        </Empty>
      ) : null}
      {waiting.length > 0 ? (
        <div className="grid">
          {waiting.map(([id, join]) => (
            <Waiting key={id} troopId={id} join={join} />
          ))}
        </div>
      ) : null}
      {troops.length > 0 ? (
        <div className="grid">
          {troops.map(([id, t]) => (
            <Link key={id} className="card link" to={`/t/${id}`}>
              <h2>{t.name}</h2>
              <p className="muted small">
                Unit {t.unitNumber} · {t.roles.join(', ')}
              </p>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
