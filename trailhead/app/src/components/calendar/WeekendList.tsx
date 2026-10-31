import { Link } from 'react-router-dom';
import { MONTH_NAMES, rangeText } from '../../lib/isoDate';
import type { Entry, WeekendInfo } from '../../lib/yearView';
import type { GridLinks } from './MonthGrid';
import { StatusMark } from './StatusMark';

interface Props {
  weekends: WeekendInfo[];
  links: GridLinks;
  canStart: boolean;
}

function EntryLink({ entry, links }: { entry: Entry; links: GridLinks }) {
  if (entry.eventId) {
    return <Link to={`/t/${links.troopId}/events/${entry.eventId}`}>{entry.label}</Link>;
  }
  if (entry.planId && links.canOpenPlans) {
    return <Link to={`/t/${links.troopId}/events/plans/${entry.planId}`}>{entry.label}</Link>;
  }
  return <>{entry.label}</>;
}

function Row({ w, links, canStart }: { w: WeekendInfo; links: GridLinks; canStart: boolean }) {
  const planUrl = `/t/${links.troopId}/events/plans?start=${w.sat}&end=${w.sun}`;
  return (
    <li className={`cal-row ${w.status}`}>
      <div className="stack" style={{ gap: 2 }}>
        <strong>{rangeText(w.sat, w.sun)}</strong>
        {w.holiday ? <span className="muted small">{w.holiday}</span> : null}
      </div>
      <div className="stack" style={{ gap: 2 }}>
        <StatusMark status={w.status} />
        {w.entries.map((e) => (
          <span key={`${e.kind}-${e.label}`}>
            <EntryLink entry={e} links={links} />
            {e.kind === 'maybe' ? <span className="muted small"> (being planned)</span> : null}
          </span>
        ))}
      </div>
      {w.status === 'open' && canStart ? (
        <Link className="btn secondary small" to={planUrl}>
          Plan something this weekend
        </Link>
      ) : null}
    </li>
  );
}

/** Weekends grouped by month, one row each: easy to read on a phone or a projector. */
export function WeekendList({ weekends, links, canStart }: Props) {
  const months = [...new Set(weekends.map((w) => w.sat.slice(0, 7)))];
  return (
    <div className="stack">
      {months.map((m) => (
        <section className="stack" key={m} aria-label={`${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`}>
          <h2 className="blazed">
            {MONTH_NAMES[Number(m.slice(5)) - 1]} {m.slice(0, 4)}
          </h2>
          <ul className="list">
            {weekends
              .filter((w) => w.sat.startsWith(m))
              .map((w) => (
                <Row key={w.sat} w={w} links={links} canStart={canStart} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
