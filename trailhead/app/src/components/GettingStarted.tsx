import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import {
  type ChecklistItem,
  type FamilyData,
  type LeaderData,
  leaderChecklist,
  parentChecklist,
  progress,
  readHidden,
  writeHidden,
} from '../lib/guidance';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';

function Checklist({ title, items, dismissKey }: { title: string; items: ChecklistItem[]; dismissKey: string }) {
  const [hidden, setHidden] = useState(() => readHidden(dismissKey));
  const { done, total, complete } = progress(items);
  if (hidden || complete) {
    return null;
  }
  return (
    <section className="card getting-started" aria-label={title}>
      <div className="row spread">
        <h2>{title}</h2>
        <span className="muted small">
          {done} of {total} done
        </span>
      </div>
      <ul className="steps">
        {items.map((i) => (
          <li key={i.id} className={i.done ? 'done' : ''}>
            <span className="tick" aria-hidden="true">
              {i.done ? '✓' : ''}
            </span>
            <span>
              {i.done ? (
                <span>
                  {i.label} <span className="sr-only">(done)</span>
                </span>
              ) : (
                <Link to={i.to}>{i.label}</Link>
              )}
              {i.done ? null : <span className="muted small"> {i.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          className="btn quiet small"
          onClick={() => {
            writeHidden(dismissKey, true);
            setHidden(true);
          }}
        >
          Hide this list
        </button>
      </div>
    </section>
  );
}

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
  return <Checklist title="Getting started" items={leaderChecklist(`/t/${troopId}`, data)} dismissKey={`start.leader.${troopId}`} />;
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

/** A checklist of first steps. Leaders get the troop version; parents get a shorter one. */
export function GettingStarted() {
  const { isLeader, has, loading } = useTroop();
  if (loading) {
    return null;
  }
  if (isLeader) {
    return <LeaderStart />;
  }
  return has('parent') ? <FamilyStart /> : null;
}
