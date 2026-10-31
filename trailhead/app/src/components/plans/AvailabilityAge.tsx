import { daysSince, isStale, type PlanOption } from '../../lib/plans';
import { useTroop } from '../../lib/troop';
import { plural } from '../../lib/plural';

/** Who set the availability and how long ago. An old status is marked in words and with an icon. */
export function AvailabilityAge({ option }: { option: PlanOption }) {
  const { memberName } = useTroop();
  const a = option.availability;
  const days = daysSince(a.at);
  if (days === null) {
    return <span className="muted small">Just set by {memberName(a.byMemberId)}</span>;
  }
  const ago = days === 0 ? 'today' : `${plural(days, 'day')} ago`;
  if (isStale(a.at)) {
    return (
      <span className="small">
        <span aria-hidden="true">⚠ </span>
        <strong>Stale: checked {ago}</strong> by {memberName(a.byMemberId)}. Check again.
      </span>
    );
  }
  return (
    <span className="muted small">
      Set by {memberName(a.byMemberId)} {ago}
    </span>
  );
}
