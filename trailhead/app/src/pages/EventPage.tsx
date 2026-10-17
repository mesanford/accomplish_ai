import { collection, doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EventSettings } from '../components/events/EventSettings';
import { FeesPanel } from '../components/events/FeesPanel';
import { PersonSignup } from '../components/events/PersonSignup';
import { SignupRoster } from '../components/events/SignupRoster';
import { RequirementRef } from '../components/RequirementRef';
import { Empty, formatDate, Loading, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { awardName } from '../lib/catalog';
import { audienceAllows, AUDIENCE_LABELS, formatFee, spotsLine } from '../lib/eventSignups';
import { importRsvps } from '../lib/eventsApi';
import { db } from '../lib/firebase';
import { useDoc, useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { TroopEvent } from '../lib/types';

function Details({ event }: { event: TroopEvent }) {
  const s = event.signups;
  const counts = event.signupCounts;
  const days =
    event.endDate && event.endDate !== event.start
      ? `${formatDate(event.start)} to ${formatDate(event.endDate)}`
      : formatDate(event.start);
  const times = event.startTime
    ? ` · ${event.startTime}${event.endTime ? ` to ${event.endTime}` : ''}`
    : '';
  return (
    <ul className="stack small">
      <li>
        {days}
        {times}
        {event.place ? ` · ${event.place}` : ''}
      </li>
      {event.feeCents ? <li>Fee: {formatFee(event.feeCents)} per Scout</li> : null}
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

function LeaderTools({ troopId, event }: { troopId: string; event: TroopEvent }) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const rsvpQ = useMemo(
    () => collection(db, `troops/${troopId}/events/${event.id}/rsvps`),
    [troopId, event.id],
  );
  const rsvps = useQuery<{ id: string; going?: boolean }>(rsvpQ, `${event.id}/rsvps`);
  const earlier = rsvps.data.filter((r) => r.going).length;
  async function run(task: () => Promise<unknown>, done: string) {
    setError('');
    setMessage('');
    try {
      await task();
      setMessage(done);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const closed = Boolean(event.signups?.closed);
  return (
    <div className="stack">
      <div className="row">
        <button
          type="button"
          className="btn secondary small"
          onClick={() =>
            run(
              () =>
                updateDoc(doc(db, `troops/${troopId}/events/${event.id}`), {
                  'signups.closed': !closed,
                }),
              closed ? 'Sign-ups reopened.' : 'Sign-ups closed.',
            )
          }
        >
          {closed ? 'Reopen sign-ups' : 'Close sign-ups'}
        </button>
        {earlier > 0 ? (
          <button
            type="button"
            className="btn secondary small"
            onClick={() =>
              run(
                () =>
                  importRsvps(troopId, event.id).then((r) =>
                    setMessage(`Added ${r.imported} from earlier RSVPs.`),
                  ),
                '',
              )
            }
          >
            Add {earlier} earlier RSVPs to the roster
          </button>
        ) : null}
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
    </div>
  );
}

export function EventPage() {
  const { eventId = '' } = useParams();
  const { troopId, access, actingScoutIds, members, isLeader, has } = useTroop();
  const ref = useMemo(() => doc(db, `troops/${troopId}/events/${eventId}`), [troopId, eventId]);
  const live = useDoc<TroopEvent>(ref);
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
      <Details event={event} />
      {s?.enabled ? (
        <section className="stack" aria-label="Your sign-ups">
          <h2>Sign up</h2>
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
              <LeaderTools troopId={troopId} event={event} />
              <SignupRoster troopId={troopId} event={event} />
            </section>
          ) : null}
          <details
            className="card"
            open={settingsOpen ?? !s?.enabled}
            onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
          >
            <summary>Event settings and sign-ups</summary>
            <EventSettings troopId={troopId} event={event} />
          </details>
        </>
      ) : null}
      {isLeader || has('treasurer') ? <FeesPanel troopId={troopId} event={event} /> : null}
    </>
  );
}
