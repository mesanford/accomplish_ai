import { collection, orderBy, query } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { plannable } from '../../lib/planForms';
import { createPlanFromEvent } from '../../lib/plansApi';
import type { TroopEvent } from '../../lib/types';
import { Field, formatDate, Notice, todayIso } from '../ui';
import { useAction } from './useAction';

/** Leaders start a plan from an event already on the calendar. */
export function PlanFromEvent({ troopId }: { troopId: string }) {
  const q = useMemo(() => query(collection(db, `troops/${troopId}/events`), orderBy('start', 'desc')), [troopId]);
  const events = useQuery<TroopEvent>(q, `${troopId}/events`);
  const [eventId, setEventId] = useState('');
  const act = useAction();
  const nav = useNavigate();
  const choices = plannable(events.data, todayIso());
  if (choices.length === 0) {
    return null;
  }
  return (
    <form
      className="form card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!eventId) {
          act.setError('Choose an event.');
          return;
        }
        void act.run(async () => {
          const out = await createPlanFromEvent(troopId, eventId);
          nav(`/t/${troopId}/events/plans/${out.planId}`);
        }, '');
      }}
    >
      <h2>Start from an event</h2>
      <Field label="Event" htmlFor="pe-event" hint="Brings its dates, place and fee into a new plan.">
        <select id="pe-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Choose an event</option>
          {choices.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} · {formatDate(ev.start)}
            </option>
          ))}
        </select>
      </Field>
      <Notice kind="error">{act.error}</Notice>
      <div>
        <button className="btn secondary" type="submit" disabled={act.busy}>
          Make a plan from it
        </button>
      </div>
    </form>
  );
}
