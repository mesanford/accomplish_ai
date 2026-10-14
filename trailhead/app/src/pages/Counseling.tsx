import { collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { SignOffForm } from '../components/SignOffForm';
import { CardStatusPill, Empty, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { awardName, badge } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useDoc, useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { BlueCard, Progress } from '../lib/types';

function CounselCard({ card }: { card: BlueCard }) {
  const { troopId, memberName } = useTroop();
  const progressRef = useMemo(() => doc(db, `troops/${troopId}/progress/${card.id}`), [troopId, card.id]);
  const progress = useDoc<Progress>(progressRef);
  const [error, setError] = useState('');
  const signed = Object.entries(progress.data?.requirements ?? {})
    .filter(([, r]) => r.status === 'signed')
    .map(([id]) => id);

  async function setStatus(status: BlueCard['status']) {
    setError('');
    try {
      await updateDoc(doc(db, `troops/${troopId}/blueCards/${card.id}`), { status });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <article className="card">
      <div className="row spread">
        <h2>
          {memberName(card.scoutId)} · {awardName(card.awardId)}
        </h2>
        <CardStatusPill status={card.status} />
      </div>
      <p className="small muted">{signed.length > 0 ? `Signed so far: ${signed.join(', ')}` : 'No requirements signed yet.'}</p>
      {card.status === 'counselor_assigned' ? (
        <div>
          <button type="button" className="btn" onClick={() => setStatus('in_progress')}>
            Start working with this Scout
          </button>
        </div>
      ) : null}
      {card.status === 'in_progress' ? (
        <>
          <SignOffForm troopId={troopId} scoutId={card.scoutId} fixedAwardId={card.awardId} versionId={card.versionId} />
          <div className="row">
            <button type="button" className="btn secondary" onClick={() => setStatus('complete')}>
              Mark {awardName(card.awardId)} complete
            </button>
            <a className="small" href={badge(card.awardId)?.officialUrl} target="_blank" rel="noreferrer">
              Check against the official requirements first
            </a>
          </div>
        </>
      ) : null}
      <Notice kind="error">{error}</Notice>
    </article>
  );
}

export function Counseling() {
  const { user } = useAuth();
  const { troopId, has } = useTroop();
  const mine = useMemo(
    () => (user ? query(collection(db, `troops/${troopId}/blueCards`), where('counselorUid', '==', user.uid)) : null),
    [troopId, user],
  );
  const cards = useQuery<BlueCard>(mine, `${troopId}/counseling/${user?.uid}`);
  if (!has('counselor', 'leader')) {
    return <Empty>This page is for merit badge counselors.</Empty>;
  }
  const active = cards.data.filter((c) => c.status === 'counselor_assigned' || c.status === 'in_progress');
  const done = cards.data.filter((c) => c.status === 'complete');
  return (
    <>
      <PageHeader eyebrow="Merit badge counselor" title="Your Scouts" />
      {active.length === 0 ? <Empty>No Scouts are assigned to you right now.</Empty> : active.map((c) => <CounselCard key={c.id} card={c} />)}
      {done.length > 0 ? (
        <section className="stack">
          <h2>Completed</h2>
          <ul className="list">
            {done.map((c) => (
              <li key={c.id}>
                <span>{awardName(c.awardId)}</span>
                <CardStatusPill status={c.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
