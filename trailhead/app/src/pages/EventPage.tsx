import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EventLogFields } from '../components/activity/EventLogFields';
import { EventEditor } from '../components/events/EventEditor';
import { EventSettings } from '../components/events/EventSettings';
import { FeesPanel } from '../components/events/FeesPanel';
import { PersonSignup } from '../components/events/PersonSignup';
import { RosterTools } from '../components/events/RosterTools';
import { SeriesEditor } from '../components/events/SeriesEditor';
import { SignupRoster } from '../components/events/SignupRoster';
import { RequirementRef } from '../components/RequirementRef';
import { Empty, formatDate, Loading, Notice, PageHeader } from '../components/ui';
import { awardName } from '../lib/catalog';
import { clockText } from '../lib/eventChanges';
import { audienceAllows, AUDIENCE_LABELS, formatFee, spotsLine } from '../lib/eventSignups';
import { NEED_LABELS } from '../lib/healthForm';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { EventSeries, TroopEvent } from '../lib/types';

function Details({ event, series }: { event: TroopEvent; series?: EventSeries | null }) {
  const s = event.signups;
  const counts = event.signupCounts;
  const days =
    event.endDate && event.endDate !== event.start
      ? `${formatDate(event.start)} to ${formatDate(event.endDate)}`
      : formatDate(event.start);
  const times = event.startTime
    ? ` · ${clockText(event.startTime)}${event.endTime ? ` to ${clockText(event.endTime)}` : ''}`
    : '';
  return (
    <ul className="stack small">
      {event.cancelled ? (
        <li>
          <Notice kind="error">
            This event is cancelled.{event.cancelNote ? ` ${event.cancelNote}` : ''}
          </Notice>
        </li>
      ) : null}
      {series ? <li>Repeats: {series.label}</li> : null}
      <li>
        {days}
        {times}
        {event.place ? ` · ${event.place}` : ''}
      </li>
      {event.feeCents ? <li>Fee: {formatFee(event.feeCents)} per Scout</li> : null}
      {event.healthForm ? <li>Health form needed: {NEED_LABELS[event.healthForm]}</li> : null}
      {(event.linkedRequirements ?? []).map((r) => (
        <li key={`${r.awardId}-${r.reqId}`}>
          Covers {awardName(r.awardId)} <RequirementRef awardId={r.awardId} reqId={r.reqId} />
        </li>
      ))}
      {s?.enabled ? (
        <>
          <li>Open to: {AUDIENCE_LABELS[s.audience].toLowerCase()}</li>
          <li>{spotsLine(counts?.held ?? 0, s.capacity, counts?.waitlist ?? 0)}</li>
          {s.deadline ? <li>Sign up by {formatDate(s.deadline)}</li> : null}
          {s.needsPermission ? <li>A parent must give permission for each Scout.</li> : null}
          {s.closed ? <li>Sign-ups are closed.</li> : null}
        </>
      ) : null}
    </ul>
  );
}

export function EventPage() {
  const { eventId = '' } = useParams();
  const { troopId, access, actingScoutIds, members, isLeader, has } = useTroop();
  const ref = useMemo(() => doc(db, `troops/${troopId}/events/${eventId}`), [troopId, eventId]);
  const live = useDoc<TroopEvent>(ref);
  const seriesId = live.data?.seriesId;
  const seriesRef = useMemo(
    () => (seriesId ? doc(db, `troops/${troopId}/eventSeries/${seriesId}`) : null),
    [troopId, seriesId],
  );
  const series = useDoc<EventSeries>(seriesRef).data;
  // Remembers the leader's choice, so turning sign-ups on doesn't snap the settings shut before "Saved." shows.
  const [settingsOpen, setSettingsOpen] = useState<boolean | null>(null);
  if (live.loading) {
    return <Loading />;
  }
  const event = live.data;
  if (!event) {
    return <Empty>That event was not found.</Empty>;
  }
  const s = event.signups;
  const kindOf = (id: string) => members.find((m) => m.id === id)?.kind;
  const mine = [
    ...new Set([...actingScoutIds, ...(access?.memberId ? [access.memberId] : [])]),
  ].filter(
    (id) => kindOf(id) && audienceAllows(s?.audience ?? 'both', kindOf(id) as 'scout' | 'adult'),
  );
  const full = Boolean(s?.capacity) && (event.signupCounts?.held ?? 0) >= (s?.capacity ?? 0);
  const name = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'Unknown member';
  return (
    <>
      <PageHeader eyebrow="Event" title={event.title}>
        {isLeader ? (
          <Link className="btn secondary small" to={`/t/${troopId}/events/${event.id}/attendance`}>
            Attendance
          </Link>
        ) : null}
      </PageHeader>
      <Details event={event} series={series} />
      {s?.enabled && !event.cancelled ? (
        <section className="stack" aria-label="Your sign-ups">
          <h2 className="blazed">Sign up</h2>
          {mine.length === 0 ? (
            <p className="muted">There is no one in your family who can sign up for this event.</p>
          ) : null}
          {mine.map((id) => (
            <PersonSignup
              key={id}
              troopId={troopId}
              event={event}
              memberId={id}
              name={name(id)}
              full={full}
            />
          ))}
        </section>
      ) : (
        <p className="muted">Sign-ups are not open for this event.</p>
      )}
      {isLeader ? (
        <>
          {s?.enabled ? (
            <section className="card stack" aria-label="Roster">
              <h2>Roster</h2>
              <RosterTools troopId={troopId} event={event} />
              <SignupRoster troopId={troopId} event={event} />
            </section>
          ) : null}
          <details className="card">
            <summary>Change the date or place, or cancel</summary>
            <EventEditor key={`${event.start}-${event.cancelled}`} troopId={troopId} event={event} />
          </details>
          {series ? (
            <details className="card">
              <summary>Change every later date</summary>
              <SeriesEditor troopId={troopId} event={event} series={series} />
            </details>
          ) : null}
          <details
            className="card"
            open={settingsOpen ?? !s?.enabled}
            onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
          >
            <summary>Event settings and sign-ups</summary>
            <EventSettings troopId={troopId} event={event} />
          </details>
          <details className="card">
            <summary>Activity log: nights, service hours and miles</summary>
            <EventLogFields troopId={troopId} event={event} />
          </details>
        </>
      ) : null}
      {isLeader || has('treasurer') ? <FeesPanel troopId={troopId} event={event} /> : null}
    </>
  );
}
