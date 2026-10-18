import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/firebase';
import { type FamilyData, type LeaderData, leaderChecklist, parentChecklist } from '../lib/guidance';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import { QuartermasterStart, TreasurerStart } from './RoleStarts';
import { Checklist } from './StartChecklist';

function LeaderStart() {
  const { troopId, troop, members } = useTroop();
  const events = useQuery<{ id: string }>(useMemo(() => collection(db, `troops/${troopId}/events`), [troopId]), `${troopId}/gs-events`);
  const paths = useQuery<{ id: string }>(useMemo(() => collection(db, `troops/${troopId}/paths`), [troopId]), `${troopId}/gs-paths`);
  const adultsWith = (role: string) => members.filter((m) => m.kind === 'adult' && (m.roles ?? []).includes(role as never)).length;
  const data: LeaderData = {
    scouts: members.filter((m) => m.kind === 'scout').length,
    parents: adultsWith('parent'),
    counselors: adultsWith('counselor'),
    events: events.data.length,
    published: Boolean(troop?.site?.published),
    paths: paths.data.length,
  };
  if (events.loading || paths.loading) {
    return null;
  }
  return (
    <Checklist
      title="Getting started"
      items={leaderChecklist(`/t/${troopId}`, data)}
      dismissKey={`start.leader.${troopId}`}
      help="gettingStarted"
    />
  );
}

function FamilyStart() {
  const { troopId, visibleScoutIds } = useTroop();
  const [data, setData] = useState<FamilyData | null>(null);
  const key = visibleScoutIds.join(',');
  useEffect(() => {
    let live = true;
    (async () => {
      let paths = 0;
      let blueCards = 0;
      for (const id of visibleScoutIds) {
        const p = await getDoc(doc(db, `troops/${troopId}/paths/${id}`)).catch(() => null);
        paths += p?.exists() ? 1 : 0;
        const c = await getDocs(query(collection(db, `troops/${troopId}/blueCards`), where('scoutId', '==', id))).catch(() => null);
        blueCards += c?.size ?? 0;
      }
      if (live) {
        setData({ scouts: visibleScoutIds.length, paths, blueCards });
      }
    })();
    return () => {
      live = false;
    };
  }, [troopId, key]);
  if (!data) {
    return null;
  }
  return <Checklist title="Getting started" items={parentChecklist(`/t/${troopId}`, data)} dismissKey={`start.family.${troopId}`} />;
}

/** A checklist of first steps. Leaders get the troop version and parents a shorter one. A treasurer and a quartermaster
 * each get their own list too, so a person with several roles sees a list for each. */
export function GettingStarted() {
  const { isLeader, has, loading } = useTroop();
  if (loading) {
    return null;
  }
  let main = null;
  if (isLeader) {
    main = <LeaderStart />;
  } else if (has('parent')) {
    main = <FamilyStart />;
  }
  return (
    <>
      {main}
      {has('treasurer') ? <TreasurerStart /> : null}
      {has('quartermaster') ? <QuartermasterStart /> : null}
    </>
  );
}
