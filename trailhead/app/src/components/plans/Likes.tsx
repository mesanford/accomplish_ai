import type { PlanOption } from '../../lib/plans';
import { setLiked } from '../../lib/plansOptions';
import { useTroop } from '../../lib/troop';
import { Notice } from '../ui';
import { useAction } from './useAction';

/** Who likes a card, and a button to like it or take the like back. */
export function Likes({
  troopId,
  planId,
  option,
  memberId,
  canShare,
}: {
  troopId: string;
  planId: string;
  option: PlanOption;
  memberId: string;
  canShare: boolean;
}) {
  const { memberName } = useTroop();
  const act = useAction();
  const likes = option.likes ?? [];
  const mine = Boolean(memberId) && likes.includes(memberId);
  return (
    <div className="row small">
      {canShare && memberId ? (
        <button
          className="btn secondary small"
          type="button"
          aria-pressed={mine}
          disabled={act.busy}
          onClick={() => act.run(() => setLiked(troopId, planId, option.id, !mine), '')}
        >
          <span aria-hidden="true">{mine ? '★ ' : '☆ '}</span>
          {mine ? 'You like this' : 'I like this'}
        </button>
      ) : null}
      <span className="muted">
        {likes.length === 0 ? 'No likes yet' : `Liked by ${likes.map((m) => memberName(m)).join(', ')}`}
      </span>
      <Notice kind="error">{act.error}</Notice>
    </div>
  );
}
