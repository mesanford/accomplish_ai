import { Link } from 'react-router-dom';
import { useTroop } from '../lib/troop';
import { yptAttention } from '../lib/ypt';
import { todayIso } from './ui';

/** Leaders only: how many adults have lapsed, missing or soon-to-expire Youth Protection training. */
export function YptAlert() {
  const { troopId, members } = useTroop();
  const count = yptAttention(members, todayIso()).length;
  if (count === 0) {
    return null;
  }
  return (
    <Link className="card link" to={`/t/${troopId}/roster`}>
      <h3>{count === 1 ? '1 adult needs Youth Protection training' : `${count} adults need Youth Protection training`}</h3>
      <span className="muted small">Their training has lapsed, has no date, or runs out within 30 days. Open the Roster to see who.</span>
    </Link>
  );
}
