import { collection, doc, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ScoutActivity } from '../components/activity/ScoutActivity';
import { AccountStatement } from '../components/AccountStatement';
import { ConsentRequestPanel } from '../components/ConsentRequestPanel';
import { CustomProgress } from '../components/CustomProgress';
import { CustomSignOff } from '../components/CustomSignOff';
import { LinkAsParent } from '../components/LinkAsParent';
import { MarkLeft } from '../components/MarkLeft';
import { MediaConsent } from '../components/MediaConsent';
import { ParentConsent } from '../components/ParentConsent';
import { PathSummary } from '../components/PathSummary';
import { BlueCardList, ProgressList } from '../components/ProgressList';
import { RankForm } from '../components/RankForm';
import { RemoveScout } from '../components/RemoveScout';
import { SignOffForm } from '../components/SignOffForm';
import { Empty, formatDate, Loading, PageHeader } from '../components/ui';
import { RANKS, rank } from '../lib/catalog';
import { isCustomAward } from '../lib/customAwards';
import { db } from '../lib/firebase';
import { useDoc, useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { BlueCard, ConsentRequest, PathDoc, Progress, ScoutRecord } from '../lib/types';

export function ScoutPage() {
  const { scoutId = '' } = useParams();
  const { troopId, members, isLeader, canManageBadges, visibleScoutIds, uidName, parentOf } = useTroop();
  const scout = members.find((m) => m.id === scoutId);
  const visible = visibleScoutIds.includes(scoutId);
  // A Scout waiting for a parent's consent shows only a name and the waiting status: nothing else is read or shown.
  const held = scout?.consentHold === true;
  const allowed = visible && !held;
  const requestRef = useMemo(
    () => (visible && held && isLeader ? doc(db, `troops/${troopId}/consentRequests/${scoutId}`) : null),
    [visible, held, isLeader, troopId, scoutId],
  );
  const request = useDoc<ConsentRequest>(requestRef);
  const base = `troops/${troopId}`;
  const recordRef = useMemo(
    () => (allowed ? doc(db, `${base}/scoutRecords/${scoutId}`) : null),
    [allowed, base, scoutId],
  );
  const pathRef = useMemo(
    () => (allowed ? doc(db, `${base}/paths/${scoutId}`) : null),
    [allowed, base, scoutId],
  );
  const progressQ = useMemo(
    () =>
      allowed ? query(collection(db, `${base}/progress`), where('scoutId', '==', scoutId)) : null,
    [allowed, base, scoutId],
  );
  const cardsQ = useMemo(
    () =>
      allowed ? query(collection(db, `${base}/blueCards`), where('scoutId', '==', scoutId)) : null,
    [allowed, base, scoutId],
  );
  const record = useDoc<ScoutRecord>(recordRef);
  const path = useDoc<PathDoc>(pathRef);
  const progress = useQuery<Progress>(progressQ, `${troopId}/progress/${scoutId}/${allowed}`);
  const cards = useQuery<BlueCard>(cardsQ, `${troopId}/cards/${scoutId}/${allowed}`);

  if (!scout) {
    return <Loading />;
  }
  if (!visible) {
    return <Empty>You can only see your own Scouts.</Empty>;
  }
  if (held) {
    return (
      <>
        <PageHeader eyebrow="Scout" title={scout.displayName} />
        <ConsentRequestPanel scout={scout} request={request.data ?? undefined} />
      </>
    );
  }
  const current = record.data ? rank(record.data.currentRankId) : undefined;
  const earned = RANKS.filter((r) => record.data?.rankDates?.[r.id]);
  const custom = progress.data.filter((p) => isCustomAward(p.awardId));
  const official = progress.data.filter((p) => !isCustomAward(p.awardId));

  return (
    <>
      <PageHeader
        eyebrow={current ? `Current rank: ${current.name}` : 'Scout'}
        title={scout.displayName}
      >
        {parentOf(scoutId) ? <span className="pill good">Your child</span> : null}
        {isLeader ? (
          <Link className="btn quiet small" to={`/t/${troopId}/scouts/${scoutId}/earlier`}>
            {canManageBadges ? 'Record earlier ranks and badges' : 'Record earlier ranks'}
          </Link>
        ) : null}
        {canManageBadges ? (
          <Link className="btn quiet small" to={`/t/${troopId}/scouts/${scoutId}/paper-card`}>
            Record a paper blue card
          </Link>
        ) : null}
      </PageHeader>
      {earned.length > 0 ? (
        <p className="muted small">
          {earned.map((r) => `${r.name} ${formatDate(record.data?.rankDates[r.id])}`).join(' · ')}
        </p>
      ) : null}
      <PathSummary path={path.data} editTo={`/t/${troopId}/scouts/${scoutId}/path`} />
      <section className="stack">
        <h2>Ranks and badges in progress</h2>
        <ProgressList progress={official} />
      </section>
      {custom.length > 0 || isLeader ? (
        <section className="stack">
          <h2>Troop awards</h2>
          <CustomProgress progress={custom} scoutName={scout.displayName} />
        </section>
      ) : null}
      {scout.kind === 'scout' ? <ScoutActivity scoutId={scoutId} rankDates={record.data?.rankDates} /> : null}
      <section className="stack">
        <h2>Blue cards</h2>
        <BlueCardList cards={cards.data} counselorName={uidName} canAddPhotos={canManageBadges} />
      </section>
      <AccountStatement scoutId={scoutId} />
      <LinkAsParent scout={scout} />
      <ParentConsent scout={scout} />
      <MediaConsent scout={scout} />
      {isLeader && scout.kind === 'scout' ? <MarkLeft scout={scout} /> : null}
      {isLeader && scout.kind === 'scout' ? <RemoveScout scout={scout} /> : null}
      {isLeader && record.data ? (
        <>
          {/* Full width: the requirement checklist needs room to read. */}
          <section className="card">
            <h2>Sign off a requirement</h2>
            <SignOffForm troopId={troopId} scoutId={scoutId} />
          </section>
          <div
            className="grid"
            style={{
              alignItems: 'start',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            }}
          >
            <section className="card">
              <h2>Sign off a troop award</h2>
              <CustomSignOff troopId={troopId} scoutId={scoutId} progress={custom} />
            </section>
            <section className="card">
              <h2>Record a rank</h2>
              <RankForm troopId={troopId} scoutId={scoutId} record={record.data} />
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
