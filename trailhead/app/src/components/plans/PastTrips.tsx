import { collection, orderBy, query } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { pastTrips } from '../../lib/planPast';
import type { EventPlan, PlanOption } from '../../lib/plans';
import { createOption } from '../../lib/plansOptions';
import type { TroopEvent } from '../../lib/types';
import { formatDate, Notice, todayIso } from '../ui';
import { useAction } from './useAction';

/** Places the troop has been for this kind of trip, each one click from a research card. */
export function PastTrips({
  troopId,
  plan,
  options,
  memberId,
}: {
  troopId: string;
  plan: EventPlan;
  options: PlanOption[];
  memberId: string;
}) {
  // The same query and cache key as the Events page, so it is usually already loaded.
  const q = useMemo(() => query(collection(db, `troops/${troopId}/events`), orderBy('start', 'desc')), [troopId]);
  const events = useQuery<TroopEvent>(q, `${troopId}/events`);
  const act = useAction();
  const trips = pastTrips(events.data, plan.kind, todayIso(), options.map((o) => o.name));
  if (trips.length === 0) {
    return null;
  }

  function add(name: string, lastDate: string, lastTitle: string, times: number) {
    const went = times > 1 ? `${times} times, most recently` : 'on';
    return act.run(
      () =>
        createOption(troopId, plan.id, memberId, {
          name,
          type: '',
          links: [],
          mapsUrl: '',
          costCents: null,
          driveMinutes: null,
          driveEstimated: false,
          capacity: null,
          amenities: [],
          bookingOpens: null,
          availability: { state: 'unknown', note: '' },
          pros: '',
          cons: '',
          notes: `The troop went ${went} ${formatDate(lastDate)} (${lastTitle}).`,
        }),
      `Added ${name}.`,
    );
  }

  return (
    <section className="card stack" aria-label="Where your troop has been">
      <h2>Where your troop has been</h2>
      <ul className="list">
        {trips.map((t) => (
          <li key={t.name}>
            <span>
              <strong>{t.name}</strong>
              <span className="muted small">
                {' '}
                · {t.times > 1 ? `${t.times} times, last ` : ''}
                {formatDate(t.lastDate)}
              </span>
            </span>
            <button
              className="btn secondary small"
              type="button"
              disabled={act.busy}
              onClick={() => add(t.name, t.lastDate, t.lastTitle, t.times)}
            >
              Add as an option
            </button>
          </li>
        ))}
      </ul>
      <Notice kind="ok">{act.message}</Notice>
      <Notice kind="error">{act.error}</Notice>
    </section>
  );
}
