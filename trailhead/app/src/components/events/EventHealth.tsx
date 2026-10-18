import { Link } from 'react-router-dom';
import { eventProblems, NEED_LABELS, problemText } from '../../lib/healthForm';
import { useHealthForm } from '../../lib/healthHooks';
import { useTroop } from '../../lib/troop';
import type { TroopEvent } from '../../lib/types';
import { EVENT_HEALTH_TIP } from '../../lib/statusTips';
import { TipPill } from '../TipPill';

/** On a person's sign-up: whether the health forms this event asks for will be valid on the event's last day. */
export function EventHealth({ event, memberId }: { event: TroopEvent; memberId: string }) {
  const { troopId, isLeader, actingScoutIds, access } = useTroop();
  const allowed = isLeader || actingScoutIds.includes(memberId) || access?.memberId === memberId;
  const live = useHealthForm(memberId, allowed && Boolean(event.healthForm));
  if (!event.healthForm || !allowed || live.loading) {
    return null;
  }
  const problems = eventProblems(event.healthForm, live.data ?? undefined, event.endDate || event.start);
  if (problems.length === 0) {
    return <p className="small"><TipPill tone="good" tip={EVENT_HEALTH_TIP}>Health form ready</TipPill></p>;
  }
  return (
    <p className="small">
      <TipPill tone="bad" tip={EVENT_HEALTH_TIP}>Health form needed</TipPill> This event needs {NEED_LABELS[event.healthForm]}. {problemText(problems)}.{' '}
      <Link to={`/t/${troopId}/health`}>Record the date</Link>
    </p>
  );
}
