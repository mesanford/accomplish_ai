import { collection, orderBy, query } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Legend } from '../components/calendar/StatusMark';
import { MonthGrid } from '../components/calendar/MonthGrid';
import { WeekendList } from '../components/calendar/WeekendList';
import { Loading, Notice, PageHeader, todayIso } from '../components/ui';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { holidaysAround } from '../lib/holidays';
import { makeIso } from '../lib/isoDate';
import { usePlanAccess, usePlans } from '../lib/planAccess';
import { useTroop } from '../lib/troop';
import type { TroopEvent } from '../lib/types';
import { buildDays, buildWeekends } from '../lib/yearView';

/** The next 12 months: which dates are booked, which are maybes, which weekends are open. */
export function TroopCalendar() {
  const { troopId } = useTroop();
  const { listAll, planner, scout } = usePlanAccess();
  const [big, setBig] = useState(false);
  const q = useMemo(() => query(collection(db, `troops/${troopId}/events`), orderBy('start', 'desc')), [troopId]);
  const events = useQuery<TroopEvent>(q, `${troopId}/events`);
  const plans = usePlans();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const from = makeIso(year, month, 1);
  const to = makeIso(year, month + 12, 0);
  const view = useMemo(() => {
    const holidays = [...holidaysAround(year), ...holidaysAround(year + 1)];
    const days = buildDays(events.data, listAll ? plans.data : [], from, to, holidays);
    return { days, weekends: buildWeekends(days, from, to, holidays) };
  }, [events.data, plans.data, listAll, from, to, year]);
  const links = { troopId, canOpenPlans: listAll };
  const months = Array.from({ length: 12 }, (_, i) => makeIso(year, month + i, 1));
  return (
    <>
      <PageHeader eyebrow="Troop" title="Year at a glance">
        <Link className="btn secondary small" to={`/t/${troopId}/events`}>
          All events
        </Link>
      </PageHeader>
      <div className="tabs" role="group" aria-label="View">
        <button className="btn secondary small" type="button" aria-pressed={big} onClick={() => setBig(!big)}>
          Big screen
        </button>
      </div>
      <Legend />
      {events.loading ? <Loading /> : null}
      <Notice kind="error">{events.error}</Notice>
      <div className={big ? 'cal-wrap cal-big' : 'cal-wrap'}>
        <div className="cal-months grid">
          {months.map((m) => (
            <MonthGrid key={m} year={Number(m.slice(0, 4))} month={Number(m.slice(5, 7))} days={view.days} links={links} />
          ))}
        </div>
        <div className="cal-list">
          <WeekendList weekends={view.weekends} links={links} canStart={planner || scout} />
        </div>
      </div>
    </>
  );
}
