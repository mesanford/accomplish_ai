import { collection } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScoutChecklist } from '../components/ScoutChecklist';
import { Empty, Field, formatDate, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { parseDollars } from '../lib/money';
import { chargeAttendees, type PayFrom, postCharge } from '../lib/moneyApi';
import { chargeProblem, chargeSummary, type Who } from '../lib/moneyForms';
import { useMoneyAccess, useRosterScouts } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';
import type { TroopEvent } from '../lib/types';

/** The treasurer charges many Scouts at once: everyone at an event, a list, or the whole roster. */
export function PostCharge() {
  const { troopId } = useTroop();
  const { isTreasurer, settings } = useMoneyAccess();
  const [params] = useSearchParams();
  const scouts = useRosterScouts().filter((s) => !s.leftAt);
  const eventsQ = useMemo(() => collection(db, 'troops', troopId, 'events'), [troopId]);
  const events = useQuery<TroopEvent>(eventsQ, `${troopId}/events`);
  const preset = params.get('scout');
  const [who, setWho] = useState<Who>(preset ? 'list' : 'event');
  const [eventId, setEventId] = useState('');
  const [picked, setPicked] = useState<string[]>(preset ? [preset] : []);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [payFrom, setPayFrom] = useState<PayFrom>('credit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const attendanceQ = useMemo(
    () => (eventId ? collection(db, 'troops', troopId, 'events', eventId, 'attendance') : null),
    [troopId, eventId],
  );
  const attendance = useQuery<{ id: string; present: boolean }>(attendanceQ, `${troopId}/att/${eventId}`);
  const present = scouts.filter((s) => attendance.data.some((a) => a.id === s.id && a.present));

  if (!isTreasurer) {
    return <Empty>Only the treasurer posts charges.</Empty>;
  }
  const sortedEvents = [...events.data].sort((a, b) => b.start.localeCompare(a.start));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    const problem = chargeProblem({ amount, description, who, eventId, picked });
    if (problem) {
      setError(problem);
      return;
    }
    const cents = parseDollars(amount) ?? 0;
    const base = { troopId, amountCents: cents, description: description.trim(), payFrom };
    setBusy(true);
    try {
      const out = await (who === 'event'
        ? chargeAttendees({ ...base, eventId })
        : postCharge({ ...base, ...(who === 'everyone' ? { everyone: true } : { scoutIds: picked }) }));
      setDone(chargeSummary(out, cents));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Scout accounts" title="Post a charge" />
      <form className="form card stack" onSubmit={submit} aria-label="Post a charge">
        <Field label="Amount" htmlFor="charge-amount" hint="In dollars, for each Scout.">
          <input id="charge-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="charge-description" hint="Families see this. Don't include card or bank numbers.">
          <input id="charge-description" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Who it applies to" htmlFor="charge-who">
          <select id="charge-who" value={who} onChange={(e) => setWho(e.target.value as Who)}>
            <option value="event">Scouts marked present at an event</option>
            <option value="list">Scouts I choose</option>
            <option value="everyone">Every Scout on the roster</option>
          </select>
        </Field>
        {who === 'event' ? (
          <Field label="Event" htmlFor="charge-event" hint={eventId ? `${present.length} Scouts marked present.` : undefined}>
            <select id="charge-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Choose an event</option>
              {sortedEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}, {formatDate(ev.start)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {who === 'list' ? <ScoutChecklist scouts={scouts} picked={picked} onChange={setPicked} legend="Scouts" /> : null}
        <Field label="How it is paid" htmlFor="charge-pay">
          <select id="charge-pay" value={payFrom} onChange={(e) => setPayFrom(e.target.value as PayFrom)}>
            <option value="credit">Pay from account credit where there is enough</option>
            <option value="open">Leave it open for the family to pay</option>
          </select>
        </Field>
        <p className="small muted">
          {settings.allowNegative
            ? 'Your troop lets balances go below zero, so paying from credit always takes the full amount.'
            : 'A Scout without enough credit gets an open charge. Their balance never goes below zero.'}
        </p>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{done}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Posting…' : 'Post charge'}
          </button>
        </div>
      </form>
    </>
  );
}
