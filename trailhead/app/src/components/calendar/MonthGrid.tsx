import { Link } from 'react-router-dom';
import { MONTH_NAMES, makeIso, weekday } from '../../lib/isoDate';
import { STATUS_TEXT, iconOf } from './StatusMark';
import type { DayInfo } from '../../lib/yearView';

const HEAD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HEAD_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface GridLinks {
  troopId: string;
  canOpenPlans: boolean;
}

function describe(day: DayInfo): string {
  const parts = [`${MONTH_NAMES[Number(day.iso.slice(5, 7)) - 1]} ${Number(day.iso.slice(8))}`];
  if (day.status) {
    const first = day.entries[0];
    parts.push(first ? `${STATUS_TEXT[day.status]}: ${first.label}` : STATUS_TEXT[day.status]);
  }
  if (day.holiday) {
    parts.push(day.holiday);
  }
  return parts.join(', ');
}

function Cell({ day, links }: { day: DayInfo; links: GridLinks }) {
  const entry = day.entries.find((e) => e.kind === 'booked') ?? day.entries[0];
  const body = (
    <>
      <span>{Number(day.iso.slice(8))}</span>
      {day.status ? (
        <span className="cal-icon" aria-hidden="true">
          {iconOf(day.status)}
        </span>
      ) : null}
    </>
  );
  const cls = `cal-day ${day.status ?? ''}${day.holiday ? ' holiday' : ''}`;
  let to: string | null = null;
  if (entry?.eventId) {
    to = `/t/${links.troopId}/events/${entry.eventId}`;
  } else if (entry?.planId && links.canOpenPlans) {
    to = `/t/${links.troopId}/events/plans/${entry.planId}`;
  }
  if (to) {
    return (
      <Link className={cls} to={to} aria-label={describe(day)} title={describe(day)}>
        {body}
      </Link>
    );
  }
  return (
    <span className={cls} title={describe(day)} aria-label={describe(day)} role="img">
      {body}
    </span>
  );
}

/** One month as a small grid, with its holidays listed underneath. */
export function MonthGrid({ year, month, days, links }: { year: number; month: number; days: Map<string, DayInfo>; links: GridLinks }) {
  const first = makeIso(year, month, 1);
  const count = Number(makeIso(year, month + 1, 0).slice(8));
  const blanks = weekday(first);
  const cells = Array.from({ length: count }, (_, i) => days.get(makeIso(year, month, i + 1)));
  const holidays = cells.filter((d): d is DayInfo => !!d && !!d.holiday);
  return (
    <section className="card cal-month" aria-label={`${MONTH_NAMES[month - 1]} ${year}`}>
      <h3>
        {MONTH_NAMES[month - 1]} {year}
      </h3>
      <div className="cal-cells" role="group" aria-label="Days">
        {HEAD.map((h, i) => (
          <abbr className="cal-head" key={HEAD_FULL[i]} title={HEAD_FULL[i]}>
            {h}
          </abbr>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {cells.map((d, i) => (d ? <Cell key={d.iso} day={d} links={links} /> : <span key={i} />))}
      </div>
      {holidays.length > 0 ? (
        <ul className="small muted cal-holidays">
          {holidays.map((d) => (
            <li key={d.iso}>
              {Number(d.iso.slice(8))}: {d.holiday}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
