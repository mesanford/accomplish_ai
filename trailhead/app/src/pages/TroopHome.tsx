import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AddScoutForm } from '../components/AddScoutForm';
import { GettingStarted } from '../components/GettingStarted';
import { HelpTip } from '../components/HelpTip';
import { NextStep } from '../components/NextStep';
import { Empty, Loading, PageHeader } from '../components/ui';
import { db } from '../lib/firebase';
import { blueCardAction, noScoutsText } from '../lib/homeCopy';
import { useQuery } from '../lib/hooks';
import { useNewLeadCount } from '../lib/leads';
import { useTroop } from '../lib/troop';
import type { BlueCard } from '../lib/types';

function ScoutCards() {
  const { troopId, members, visibleScoutIds, isLeader, access, parentOf } = useTroop();
  const scouts = members.filter((m) => visibleScoutIds.includes(m.id));
  if (scouts.length === 0) {
    return isLeader ? (
      <NextStep action="Add your first Scout" to={`/t/${troopId}/roster`}>
        No Scouts yet. Add your Scouts on the Roster, then invite their parents.
      </NextStep>
    ) : (
      <Empty>{noScoutsText(access?.roles ?? [])}</Empty>
    );
  }
  return (
    <div className="grid">
      {scouts.map((s) => (
        <Link key={s.id} className="card link" to={`/t/${troopId}/scouts/${s.id}`}>
          <h3>{s.displayName}</h3>
          <span className="muted small">
            {parentOf(s.id) ? 'Your child · ' : ''}View path, badges and blue cards
          </span>
        </Link>
      ))}
    </div>
  );
}

function LeadAlert() {
  const { troopId } = useTroop();
  const count = useNewLeadCount();
  if (count === 0) {
    return null;
  }
  return (
    <Link className="card link" to={`/t/${troopId}/recruiting`}>
      <h3>{count === 1 ? '1 family wants to hear about the troop' : `${count} families want to hear about the troop`}</h3>
      <span className="muted small">They filled in the Join us form on your website. Open this to reply and invite them.</span>
    </Link>
  );
}

function LeaderSummary() {
  const { troopId, canManageBadges } = useTroop();
  const pendingQuery = useMemo(
    () => query(collection(db, 'troops', troopId, 'blueCards'), where('status', 'in', ['requested', 'approved'])),
    [troopId],
  );
  const pending = useQuery<BlueCard>(pendingQuery, `${troopId}/pending-cards`);
  const action = blueCardAction(pending.data.length, canManageBadges);
  return (
    <div className="row">
      <Link className={action.waiting ? 'btn' : 'btn quiet'} to={`/t/${troopId}/blue-cards`}>
        {action.text}
      </Link>
      <HelpTip topic="blueCard" />
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
      <GettingStarted />
      {isLeader ? <LeadAlert /> : null}
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
          <h2>
            Add your Scout
            <HelpTip topic="birthMonth" label="why we ask about age" />
          </h2>
          <p className="muted small">If your Scout isn't listed above, add them here. They'll be linked to you.</p>
          <AddScoutForm troopId={troopId} />
        </section>
      ) : null}
    </>
  );
}
