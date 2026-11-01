import { Link } from 'react-router-dom';
import { MONTH_NAMES, rangeText } from '../../lib/isoDate';
import { type CouncilEvent, councilEventsIn } from '../../lib/councilEvents';
import type { Entry, WeekendInfo } from '../../lib/yearView';
import type { GridLinks } from './MonthGrid';
import { StatusMark } from './StatusMark';

interface Props {
  weekends: WeekendInfo[];
  links: GridLinks;
  canStart: boolean;
  /** The council's events, shown beside the troop's own: they don't book a weekend. */
  council: CouncilEvent[];
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

function CouncilLine({ e, links, canStart }: { e: CouncilEvent; links: GridLinks; canStart: boolean }) {
  const params = new URLSearchParams({ start: e.start, end: e.end ?? e.start, title: e.title });
  return (
    <span className="small">
      <span aria-hidden="true">◇ </span>Council: {e.title}
      {e.repeats ? <span className="muted"> (repeats)</span> : null}
      {canStart ? (
        <>
          {' · '}
          <Link to={`/t/${links.troopId}/events/plans?${params.toString()}`}>Start a plan from this</Link>
        </>
      ) : null}
    </span>
  );
}

function Row({ w, links, canStart, council }: { w: WeekendInfo; links: GridLinks; canStart: boolean; council: CouncilEvent[] }) {
  const planUrl = `/t/${links.troopId}/events/plans?start=${w.sat}&end=${w.sun}`;
  const fromCouncil = councilEventsIn(council, w.sat, w.sun);
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
        {fromCouncil.map((e) => (
          <CouncilLine key={`${e.start}-${e.title}`} e={e} links={links} canStart={canStart} />
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
export function WeekendList({ weekends, links, canStart, council }: Props) {
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
                <Row key={w.sat} w={w} links={links} canStart={canStart} council={council} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
