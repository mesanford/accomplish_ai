import { Link } from 'react-router-dom';
import { AddScoutForm } from '../components/AddScoutForm';
import { GettingStarted } from '../components/GettingStarted';
import { LeaderStats } from '../components/home/LeaderStats';
import { QuickActions } from '../components/home/QuickActions';
import { UpcomingEvents } from '../components/home/UpcomingEvents';
import { useUpcoming } from '../components/home/useUpcoming';
import { HelpTip } from '../components/HelpTip';
import { HomeAnnouncement } from '../components/HomeAnnouncement';
import { NoticeUpdateCard } from '../components/NoticeUpdateCard';
import { NextStep } from '../components/NextStep';
import { YptAlert } from '../components/YptAlert';
import { Empty, Loading, PageHeader } from '../components/ui';
import { noScoutsText } from '../lib/homeCopy';
import { useStaleScouts } from '../lib/consentHooks';
import { useNewLeadCount } from '../lib/leads';
import { useTroop } from '../lib/troop';

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
      <h3>
        {count === 1
          ? '1 family wants to hear about the troop'
          : `${count} families want to hear about the troop`}
      </h3>
      <span className="muted small">
        They filled in the Join us form on your website. Open this to reply and invite them.
      </span>
    </Link>
  );
}

function NoticeAlert() {
  const { troopId } = useTroop();
  const count = useStaleScouts().size;
  if (count === 0) {
    return null;
  }
  return (
    <Link className="card link" to={`/t/${troopId}/roster`}>
      <h3>
        {count === 1
          ? "1 Scout has a parent who hasn't reviewed the new notice"
          : `${count} Scouts have a parent who hasn't reviewed the new notice`}
      </h3>
      <span className="muted small">Open the Roster to see who, and to send them a reminder.</span>
    </Link>
  );
}

export function TroopHome() {
  const { troop, access, loading, isLeader, has, troopId } = useTroop();
  const upcoming = useUpcoming(troopId);
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
      <HomeAnnouncement />
      {isLeader ? <YptAlert /> : null}
      <NoticeUpdateCard />
      {isLeader ? <LeadAlert /> : null}
      {isLeader ? <NoticeAlert /> : null}
      <QuickActions />
      <section className="stack" aria-label="What's happening">
        <h2 className="blazed">What's happening</h2>
        {isLeader ? <LeaderStats events={upcoming.events} today={upcoming.today} /> : null}
        <h3>Coming up</h3>
        <UpcomingEvents troopId={troopId} events={upcoming.events} today={upcoming.today} isLeader={isLeader} />
      </section>
      <section className="stack" id="scouts">
        <h2 className="blazed">{isLeader ? 'Scouts' : 'Your Scouts'}</h2>
        <ScoutCards />
      </section>
      {has('parent') && !isLeader ? (
        <section className="card">
          <h2>
            Add your Scout
            <HelpTip topic="birthMonth" label="why we ask about age" />
          </h2>
          <p className="muted small">
            If your Scout isn't listed above, add them here. They'll be linked to you.
          </p>
          <AddScoutForm troopId={troopId} />
        </section>
      ) : null}
    </>
  );
}
