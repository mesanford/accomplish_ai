import { addDoc, collection, orderBy, query } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RequirementPicker } from '../components/RequirementPicker';
import { RequirementRef } from '../components/RequirementRef';
import { GuideBlock } from '../components/GuideBlock';
import { HelpTip } from '../components/HelpTip';
import { NextStep } from '../components/NextStep';
import { Empty, Field, formatDate, Notice, PageHeader, todayIso } from '../components/ui';
import { errorMessage } from '../lib/api';
import { awardName, BADGES } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { TroopEvent } from '../lib/types';

function EventForm({ troopId }: { troopId: string }) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(todayIso());
  const [nights, setNights] = useState('0');
  const [miles, setMiles] = useState('0');
  const [hours, setHours] = useState('0');
  const [awardId, setAwardId] = useState('');
  const [reqId, setReqId] = useState('');
  const [place, setPlace] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const linked = awardId && reqId.trim() ? [{ awardId, reqId: reqId.trim() }] : [];
    try {
      await addDoc(collection(db, `troops/${troopId}/events`), {
        title: title.trim(),
        start,
        logValues: { nights: Number(nights), miles: Number(miles), serviceHours: Number(hours) },
        linkedRequirements: linked,
        place: place.trim(),
        public: isPublic,
      });
      setTitle('');
      setPlace('');
      setIsPublic(false);
      setReqId('');
      setAwardId('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Event" htmlFor="ev-title">
        <input id="ev-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="October campout" />
      </Field>
      <Field label="Date" htmlFor="ev-date">
        <input id="ev-date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="Place" htmlFor="ev-place" hint="Optional. Shown on the troop website if the event is listed there.">
        <input id="ev-place" maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Camp Lowden" />
      </Field>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show on the troop website
          <HelpTip topic="publicEvent" />
        </label>
        <span className="hint">Only the event's name, day and place appear there.</span>
      </div>
      <div className="row">
        <Field label="Nights camped" htmlFor="ev-nights">
          <input id="ev-nights" type="number" min="0" value={nights} onChange={(e) => setNights(e.target.value)} />
        </Field>
        <Field label="Miles hiked" htmlFor="ev-miles">
          <input id="ev-miles" type="number" min="0" value={miles} onChange={(e) => setMiles(e.target.value)} />
        </Field>
        <Field label="Service hours" htmlFor="ev-hours">
          <input id="ev-hours" type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <Field
        label="Requirement covered (optional)"
        htmlFor="ev-award"
        hint="If this event covers a merit badge requirement, pick it. Scouts who attend are marked ready for a counselor to sign off."
      >
        <div className="row">
          <select
            id="ev-award"
            value={awardId}
            onChange={(e) => {
              setAwardId(e.target.value);
              setReqId('');
            }}
            style={{ width: 'auto' }}
          >
            <option value="">None</option>
            {BADGES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </Field>
      {awardId ? (
        <div className="stack">
          <RequirementPicker
            key={awardId}
            awardId={awardId}
            value={reqId ? [reqId] : []}
            onChange={(v) => setReqId(v[0] ?? '')}
            inputLabel="Requirement number"
          />
          {reqId ? <p className="small">Covers {awardName(awardId)} requirement {reqId}.</p> : null}
        </div>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <div>
        <button className="btn" type="submit">
          Add event
        </button>
      </div>
    </form>
  );
}

export function Events() {
  const { troopId, isLeader } = useTroop();
  const q = useMemo(() => query(collection(db, `troops/${troopId}/events`), orderBy('start', 'desc')), [troopId]);
  const events = useQuery<TroopEvent>(q, `${troopId}/events`);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Events" />
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
                <strong>{ev.title}</strong>
                <span className="muted small">
                  {formatDate(ev.start)}
                  {ev.place ? ` · ${ev.place}` : ''}
                  {ev.public ? ' · On the troop website' : ''}
                  {ev.logValues?.nights ? ` · ${ev.logValues.nights} nights` : ''}
                  {ev.logValues?.miles ? ` · ${ev.logValues.miles} miles` : ''}
                  {ev.logValues?.serviceHours ? ` · ${ev.logValues.serviceHours} service hours` : ''}
                  {(ev.linkedRequirements ?? []).map((r) => (
                    <span key={`${r.awardId}-${r.reqId}`}>
                      {' · '}
                      {awardName(r.awardId)} <RequirementRef awardId={r.awardId} reqId={r.reqId} />
                    </span>
                  ))}
                </span>
              </div>
              {isLeader ? (
                <Link className="btn secondary small" to={`/t/${troopId}/events/${ev.id}`}>
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
