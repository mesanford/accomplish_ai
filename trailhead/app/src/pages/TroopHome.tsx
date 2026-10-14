import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AddScoutForm } from '../components/AddScoutForm';
import { Empty, Loading, PageHeader } from '../components/ui';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { BlueCard } from '../lib/types';

function ScoutCards() {
  const { troopId, members, visibleScoutIds } = useTroop();
  const scouts = members.filter((m) => visibleScoutIds.includes(m.id));
  if (scouts.length === 0) {
    return <Empty>No Scouts yet. Add one from the roster.</Empty>;
  }
  return (
    <div className="grid">
      {scouts.map((s) => (
        <Link key={s.id} className="card link" to={`/t/${troopId}/scouts/${s.id}`}>
          <h3>{s.displayName}</h3>
          <span className="muted small">View path, badges and blue cards</span>
        </Link>
      ))}
    </div>
  );
}

function LeaderSummary() {
  const { troopId } = useTroop();
  const pendingQuery = useMemo(
    () => query(collection(db, 'troops', troopId, 'blueCards'), where('status', 'in', ['requested', 'approved'])),
    [troopId],
  );
  const pending = useQuery<BlueCard>(pendingQuery, `${troopId}/pending-cards`);
  const count = pending.data.length;
  return (
    <div className="row">
      <Link className="btn" to={`/t/${troopId}/blue-cards`}>
        {count === 1 ? '1 blue card needs action' : `${count} blue cards need action`}
      </Link>
      <Link className="btn secondary" to={`/t/${troopId}/roster`}>
        Add Scouts and invite families
      </Link>
      <Link className="btn quiet" to={`/t/${troopId}/events`}>
        Take attendance
      </Link>
    </div>
  );
}

export function TroopHome() {
  const { troop, access, loading, isLeader, has, troopId } = useTroop();
  if (loading && !troop) {
    return <Loading />;
  }
  if (!access) {
    return <Empty>You're not a member of this troop. Ask a leader for an invite link.</Empty>;
  }
  return (
    <>
      <PageHeader eyebrow={`Unit ${troop?.unitNumber ?? ''}`} title={troop?.name ?? 'Troop'} />
      {isLeader ? <LeaderSummary /> : null}
      {has('counselor') ? (
        <div className="row">
          <Link className="btn secondary" to={`/t/${troopId}/counseling`}>
            Your merit badge Scouts
          </Link>
        </div>
      ) : null}
      <section className="stack">
        <h2>{isLeader ? 'Scouts' : 'Your Scouts'}</h2>
        <ScoutCards />
      </section>
      {has('parent') && !isLeader ? (
        <section className="card">
          <h2>Add your Scout</h2>
          <p className="muted small">If your Scout isn't listed above, add them here. They'll be linked to you.</p>
          <AddScoutForm troopId={troopId} />
        </section>
      ) : null}
    </>
  );
}
