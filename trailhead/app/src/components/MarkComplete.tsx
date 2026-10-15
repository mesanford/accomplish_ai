import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { awardName } from '../lib/catalog';
import { incompleteWarning, signedCount } from '../lib/completion';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { statusLookup } from '../lib/requirements';
import { useRequirements } from '../lib/useRequirements';
import { useTroop } from '../lib/troop';
import type { BlueCard, Progress } from '../lib/types';
import { Notice } from './ui';

interface Props {
  card: BlueCard;
  onComplete: () => void;
  /** Button style; the counselor's page uses the default. */
  small?: boolean;
}

/** "Mark <badge> complete". With requirements still unsigned it asks first, in place, naming how many are signed. */
export function MarkComplete({ card, onComplete, small }: Props) {
  const { troopId } = useTroop();
  const progressRef = useMemo(() => doc(db, `troops/${troopId}/progress/${card.id}`), [troopId, card.id]);
  const progress = useDoc<Progress>(progressRef);
  const reqs = useRequirements(card.awardId);
  const [confirming, setConfirming] = useState(false);
  const name = awardName(card.awardId);
  const signedIds = Object.entries(progress.data?.requirements ?? {})
    .filter(([, r]) => r.status === 'signed')
    .map(([id]) => id);
  const warning = incompleteWarning(name, signedCount(reqs.doc, statusLookup(progress.data?.requirements), signedIds));

  if (confirming && warning) {
    return (
      <Notice kind="warn">
        <div className="stack">
          <span>{warning}</span>
          <div className="row">
            <button type="button" className={`btn${small ? ' small' : ''}`} onClick={onComplete}>
              Mark complete anyway
            </button>
            <button type="button" className={`btn quiet${small ? ' small' : ''}`} onClick={() => setConfirming(false)}>
              Keep working
            </button>
          </div>
        </div>
      </Notice>
    );
  }
  return (
    <button
      type="button"
      className={`btn secondary${small ? ' small' : ''}`}
      disabled={reqs.loading || progress.loading}
      onClick={() => (warning ? setConfirming(true) : onComplete())}
    >
      Mark {name} complete
    </button>
  );
}
