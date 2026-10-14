import { doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { errorMessage } from '../lib/api';
import { awardName } from '../lib/catalog';
import { counselorLabel, hasOutsideCounselor } from '../lib/cards';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { statusLookup } from '../lib/requirements';
import { useTroop } from '../lib/troop';
import type { BlueCard, Progress } from '../lib/types';
import { CardPhotos } from './CardPhotos';
import { CounselChecklist } from './CounselChecklist';
import { type CardPatch, CounselorAssign } from './CounselorAssign';
import { CardStatusPill, Notice } from './ui';

/** For a card with a counselor outside the troop: the leader signs requirements for them and completes the badge. */
function OutsideCounselorPanel({ card, change }: { card: BlueCard; change: (patch: CardPatch) => void }) {
  const { troopId } = useTroop();
  const [open, setOpen] = useState(false);
  const progressRef = useMemo(() => doc(db, `troops/${troopId}/progress/${card.id}`), [troopId, card.id]);
  const progress = useDoc<Progress>(open ? progressRef : null);
  const statuses = useMemo(() => statusLookup(progress.data?.requirements), [progress.data]);
  const name = card.counselorName ?? '';
  return (
    <div className="stack" style={{ flexBasis: '100%' }}>
      <div className="row">
        <button type="button" className="btn quiet small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide requirements' : `Sign requirements for ${name}`}
        </button>
        <button type="button" className="btn secondary small" onClick={() => change({ status: 'complete' })}>
          Mark {awardName(card.awardId)} complete
        </button>
      </div>
      {open ? (
        <>
          <p className="small muted">Each requirement is recorded as signed by you, for {name}, counselor.</p>
          <CounselChecklist
            troopId={troopId}
            scoutId={card.scoutId}
            awardId={card.awardId}
            versionId={card.versionId}
            statuses={statuses}
            onBehalfOf={name}
          />
        </>
      ) : null}
    </div>
  );
}

export function BlueCardRow({ card }: { card: BlueCard }) {
  const { troopId, members, memberName, uidName } = useTroop();
  const counselors = members.filter((m) => m.uid && (m.roles ?? []).some((r) => r === 'counselor' || r === 'leader'));
  const [error, setError] = useState('');
  const ref = doc(db, `troops/${troopId}/blueCards/${card.id}`);
  const assigning = card.status === 'approved' || card.status === 'counselor_assigned';

  async function change(patch: CardPatch) {
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
          <CardStatusPill status={card.status} /> Counselor: {counselorLabel(card, uidName)}
        </span>
        <CardPhotos troopId={troopId} card={card} canAdd />
        <Notice kind="error">{error}</Notice>
      </div>
      <div className="row">
        {card.status === 'requested' ? (
          <button type="button" className="btn small" onClick={() => change({ status: 'approved' })}>
            Approve
          </button>
        ) : null}
        {assigning ? <CounselorAssign card={card} counselors={counselors} onAssign={change} /> : null}
        <button type="button" className="btn danger small" onClick={() => change({ status: 'cancelled' })}>
          Cancel
        </button>
      </div>
      {hasOutsideCounselor(card) && (card.status === 'counselor_assigned' || card.status === 'in_progress') ? (
        <OutsideCounselorPanel card={card} change={change} />
      ) : null}
    </li>
  );
}
