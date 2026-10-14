import { collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { CardStatusPill, Empty, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { awardName } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { BlueCard } from '../lib/types';

const OPEN = ['requested', 'approved', 'counselor_assigned', 'in_progress'];

function CardRow({ card }: { card: BlueCard }) {
  const { troopId, members, memberName, uidName } = useTroop();
  const counselors = members.filter((m) => m.uid && (m.roles ?? []).some((r) => r === 'counselor' || r === 'leader'));
  const [counselorUid, setCounselorUid] = useState(card.counselorUid ?? '');
  const [error, setError] = useState('');
  const ref = doc(db, `troops/${troopId}/blueCards/${card.id}`);

  async function change(patch: Partial<BlueCard>) {
    setError('');
    try {
      await updateDoc(ref, patch);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li>
      <div className="stack" style={{ gap: 2 }}>
        <strong>
          {memberName(card.scoutId)} · {awardName(card.awardId)}
        </strong>
        <span className="row small muted">
          <CardStatusPill status={card.status} /> Counselor: {uidName(card.counselorUid)}
        </span>
        <Notice kind="error">{error}</Notice>
      </div>
      <div className="row">
        {card.status === 'requested' ? (
          <button type="button" className="btn small" onClick={() => change({ status: 'approved' })}>
            Approve
          </button>
        ) : null}
        {card.status === 'approved' || card.status === 'counselor_assigned' ? (
          <>
            <select aria-label="Counselor" value={counselorUid} onChange={(e) => setCounselorUid(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Choose counselor</option>
              {counselors.map((c) => (
                <option key={c.id} value={c.uid}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small"
              disabled={!counselorUid}
              onClick={() => change({ status: 'counselor_assigned', counselorUid })}
            >
              Assign
            </button>
          </>
        ) : null}
        <button type="button" className="btn danger small" onClick={() => change({ status: 'cancelled' })}>
          Cancel
        </button>
      </div>
    </li>
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
      <p className="muted">Approve requests, then assign a merit badge counselor. Counselors sign the requirements.</p>
      {sorted.length === 0 ? <Empty>No open blue cards.</Empty> : <ul className="list">{sorted.map((c) => <CardRow key={c.id} card={c} />)}</ul>}
    </>
  );
}
