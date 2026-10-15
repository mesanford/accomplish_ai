import { collection, query, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BlueCardRow } from '../components/BlueCardRow';
import { Empty, PageHeader } from '../components/ui';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { BlueCard } from '../lib/types';

const OPEN = ['requested', 'approved', 'counselor_assigned', 'in_progress'];

/** Pick a Scout, then open the form for a blue card they brought signed on paper. */
function PaperCardStart() {
  const { troopId, members } = useTroop();
  const scouts = members.filter((m) => m.kind === 'scout');
  const [scoutId, setScoutId] = useState('');
  return (
    <section className="card">
      <h2>A Scout brought a paper blue card?</h2>
      <p className="small muted">
        Counselors outside the troop don't need a Forthright account. Record the card as it is signed, with a photo of it.
      </p>
      <div className="row">
        <select aria-label="Scout with a paper card" value={scoutId} onChange={(e) => setScoutId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Choose a Scout</option>
          {scouts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
        {scoutId ? (
          <Link className="btn small" to={`/t/${troopId}/scouts/${scoutId}/paper-card`}>
            Record a paper blue card
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function BlueCards() {
  const { troopId, isLeader } = useTroop();
  const openQuery = useMemo(
    () => (isLeader ? query(collection(db, `troops/${troopId}/blueCards`), where('status', 'in', OPEN)) : null),
    [troopId, isLeader],
  );
  const cards = useQuery<BlueCard>(openQuery, `${troopId}/open-cards/${isLeader}`);
  if (!isLeader) {
    return <Empty>Only leaders manage blue cards.</Empty>;
  }
  const order = (c: BlueCard) => OPEN.indexOf(c.status);
  const sorted = [...cards.data].sort((a, b) => order(a) - order(b));
  return (
    <>
      <PageHeader eyebrow="Advancement" title="Blue cards" />
      <p className="muted">
        Approve requests, then assign a merit badge counselor: a troop member, or someone outside the troop whom you sign
        for.
      </p>
      {sorted.length === 0 ? <Empty>No open blue cards.</Empty> : <ul className="list">{sorted.map((c) => <BlueCardRow key={c.id} card={c} />)}</ul>}
      <PaperCardStart />
    </>
  );
}
