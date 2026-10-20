import { collection, orderBy, query } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EventForm } from '../components/events/EventForm';
import { FeedLink } from '../components/events/FeedLink';
import { RequirementRef } from '../components/RequirementRef';
import { GuideBlock } from '../components/GuideBlock';
import { NextStep } from '../components/NextStep';
import { Empty, formatDate, PageHeader } from '../components/ui';
import { awardName } from '../lib/catalog';
import { clockText } from '../lib/eventChanges';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { formatFee, spotsLine } from '../lib/eventSignups';
import { plural } from '../lib/plural';
import { useTroop } from '../lib/troop';
import type { TroopEvent } from '../lib/types';

export function Events() {
  const { troopId, isLeader } = useTroop();
  const q = useMemo(() => query(collection(db, `troops/${troopId}/events`), orderBy('start', 'desc')), [troopId]);
  const events = useQuery<TroopEvent>(q, `${troopId}/events`);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Events" />
      <FeedLink />
      {isLeader ? (
        <GuideBlock
          id="events"
          purpose="Events are your meetings, campouts and service days. They let you take attendance and log camping nights."
          steps={[
            'Add an event with the form below.',
            'On the day, open the event and tick the Scouts who came.',
            'Their nights, miles and hours are saved to their records.',
          ]}
        />
      ) : null}
      {events.data.length === 0 ? (
        isLeader ? (
          <NextStep action="Add your first event" onClick={() => document.getElementById('ev-title')?.focus()}>
            No events yet. Add your next meeting or campout with the form below.
          </NextStep>
        ) : (
          <Empty>No events yet. A leader will add them here.</Empty>
        )
      ) : (
        <ul className="list">
          {events.data.map((ev) => (
            <li key={ev.id}>
              <div className="stack" style={{ gap: 2 }}>
                <Link to={`/t/${troopId}/events/${ev.id}`}>
                  <strong>{ev.title}</strong>
                </Link>
                <span className="muted small">
                  {ev.cancelled ? <span className="pill bad">Cancelled</span> : null}
                  {ev.cancelled ? ' ' : ''}
                  {formatDate(ev.start)}
                  {ev.startTime ? ` · ${clockText(ev.startTime)}` : ''}
                  {ev.place ? ` · ${ev.place}` : ''}
                  {ev.public ? ' · On the troop website' : ''}
                  {ev.feeCents ? ` · Fee ${formatFee(ev.feeCents)}` : ''}
                  {ev.signups?.enabled ? ` · ${spotsLine(ev.signupCounts?.held ?? 0, ev.signups.capacity, ev.signupCounts?.waitlist ?? 0)}` : ''}
                  {ev.logValues?.nights ? ` · ${plural(ev.logValues.nights, 'night')}` : ''}
                  {ev.logValues?.miles ? ` · ${plural(ev.logValues.miles, 'mile')}` : ''}
                  {ev.logValues?.serviceHours ? ` · ${plural(ev.logValues.serviceHours, 'service hour')}` : ''}
                  {(ev.linkedRequirements ?? []).map((r) => (
                    <span key={`${r.awardId}-${r.reqId}`}>
                      {' · '}
                      {awardName(r.awardId)} <RequirementRef awardId={r.awardId} reqId={r.reqId} />
                    </span>
                  ))}
                </span>
              </div>
              {isLeader ? (
                <Link className="btn secondary small" to={`/t/${troopId}/events/${ev.id}/attendance`}>
                  Attendance
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {isLeader ? (
        <section className="card">
          <h2>Add an event</h2>
          <EventForm troopId={troopId} />
        </section>
      ) : null}
    </>
  );
}
