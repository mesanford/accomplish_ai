import { Link } from 'react-router-dom';
import { clockText } from '../../lib/eventChanges';
import { spotsLine } from '../../lib/eventSignups';
import { soonEvents, SOON_DAYS } from '../../lib/homeStats';
import type { TroopEvent } from '../../lib/types';
import { Empty, formatDate } from '../ui';

/** The next two weeks of events, for everyone in the troop. Leaders also see how full each one is. */
export function UpcomingEvents({
  troopId,
  events,
  today,
  isLeader,
}: {
  troopId: string;
  events: TroopEvent[];
  today: string;
  isLeader: boolean;
}) {
  const soon = soonEvents(events, today).slice(0, 6);
  if (soon.length === 0) {
    return <Empty>Nothing on the calendar in the next {SOON_DAYS} days.</Empty>;
  }
  return (
    <ul className="list" aria-label="Coming up">
      {soon.map((e) => (
        <li key={e.id}>
          <span className="stack" style={{ gap: 2 }}>
            <Link to={`/t/${troopId}/events/${e.id}`}>
              <strong>{e.title}</strong>
            </Link>
            <span className="small muted">
              {e.cancelled ? <span className="pill bad">Cancelled</span> : null}
              {e.cancelled ? ' ' : ''}
              {formatDate(e.start)}
              {e.startTime ? ` · ${clockText(e.startTime)}` : ''}
              {e.place ? ` · ${e.place}` : ''}
              {isLeader && e.signups?.enabled && !e.cancelled
                ? ` · ${spotsLine(e.signupCounts?.held ?? 0, e.signups.capacity, e.signupCounts?.waitlist ?? 0)}`
                : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
