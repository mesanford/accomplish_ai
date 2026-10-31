import { type FormEvent, useState } from 'react';
import { intOrNull } from '../../lib/planForms';
import type { Staffing, Transport } from '../../lib/plans';
import { setStaffing } from '../../lib/plansApi';
import { useTroop } from '../../lib/troop';
import { Field, Notice } from '../ui';
import type { PlanTabProps } from './planProps';
import { useAction } from './useAction';

const TRANSPORT: [Transport, string][] = [
  ['families', 'Families drive their own Scouts'],
  ['carpool', 'Adults carpool'],
  ['none', 'No driving'],
];

interface DriverRow {
  memberId: string;
  seats: string;
}

/** Adults who are coming, how everyone gets there, and the drivers. */
export function StaffingForm({ troopId, plan, canEdit }: PlanTabProps) {
  const { members } = useTroop();
  const adults = members.filter((m) => m.kind === 'adult');
  const s = plan.staffing;
  const [chosen, setChosen] = useState<string[]>(s?.adultMemberIds ?? []);
  const [fromSignups, setFromSignups] = useState(Boolean(s?.adultsFromSignups));
  const [transport, setTransport] = useState<Transport | null>(s?.transport ?? null);
  const [drivers, setDrivers] = useState<DriverRow[]>((s?.drivers ?? []).map((d) => ({ memberId: d.memberId, seats: String(d.seats) })));
  const [minutes, setMinutes] = useState(s?.driveMinutes ? String(s.driveMinutes) : '');
  const [licensed, setLicensed] = useState(Boolean(s?.attest?.licensed));
  const [seatBelts, setSeatBelts] = useState(Boolean(s?.attest?.seatBelts));
  const [problem, setProblem] = useState('');
  const act = useAction();

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const setDriver = (i: number, patch: Partial<DriverRow>) =>
    setDrivers((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  function save(e: FormEvent) {
    e.preventDefault();
    const mins = intOrNull(minutes, 1440);
    const seats = drivers.map((d) => intOrNull(d.seats, 15));
    if (mins === undefined || seats.includes(undefined)) {
      setProblem('Enter minutes and seats as whole numbers.');
    } else if (drivers.some((d) => !d.memberId)) {
      setProblem('Choose each driver from the list, or remove the empty row.');
    } else {
      setProblem('');
      const staffing: Staffing = {
        adultMemberIds: chosen,
        adultsFromSignups: fromSignups,
        transport,
        drivers: drivers.map((d, i) => ({ memberId: d.memberId, seats: seats[i] ?? 0 })),
        driveMinutes: mins ?? 0,
        attest: { licensed, seatBelts },
      };
      void act.run(() => setStaffing(troopId, plan.id, staffing));
    }
  }

  return (
    <form className="form" onSubmit={save} noValidate>
      <fieldset className="stack" disabled={!canEdit}>
        <legend>Adults and drivers</legend>
        <fieldset className="stack">
          <legend>Adults coming</legend>
          {adults.length === 0 ? <p className="muted">No adults in the troop yet.</p> : null}
          {adults.map((m) => (
            <label key={m.id} className="check">
              <input type="checkbox" checked={chosen.includes(m.id)} onChange={() => toggle(m.id)} />
              {m.displayName}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={fromSignups} onChange={(e) => setFromSignups(e.target.checked)} />
          Adults will come from sign-ups
        </label>
        <fieldset className="stack">
          <legend>How everyone gets there</legend>
          {TRANSPORT.map(([value, label]) => (
            <label key={value} className="check">
              <input type="radio" name="transport" checked={transport === value} onChange={() => setTransport(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        <h3>Drivers</h3>
        {drivers.map((d, i) => (
          <div className="row" key={i}>
            <Field label={`Driver ${i + 1}`} htmlFor={`sf-d${i}`}>
              <select id={`sf-d${i}`} value={d.memberId} onChange={(e) => setDriver(i, { memberId: e.target.value })}>
                <option value="">Choose an adult</option>
                {adults.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Seats in driver ${i + 1}'s car`} htmlFor={`sf-s${i}`}>
              <input id={`sf-s${i}`} inputMode="numeric" value={d.seats} onChange={(e) => setDriver(i, { seats: e.target.value })} />
            </Field>
            <button className="btn secondary small" type="button" onClick={() => setDrivers((all) => all.filter((_, j) => j !== i))}>
              Remove driver {i + 1}
            </button>
          </div>
        ))}
        <div>
          <button className="btn secondary small" type="button" onClick={() => setDrivers((all) => [...all, { memberId: '', seats: '' }])}>
            Add a driver
          </button>
        </div>
        <Field label="Longest day's drive, in minutes" htmlFor="sf-min">
          <input id="sf-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} />
          Every driver is 18 or older with a valid licence
        </label>
        <label className="check">
          <input type="checkbox" checked={seatBelts} onChange={(e) => setSeatBelts(e.target.checked)} />
          Every rider will have a seat belt
        </label>
      </fieldset>
      <Notice kind="error">{problem || act.error}</Notice>
      <Notice kind="ok">{act.message}</Notice>
      {canEdit ? (
        <div>
          <button className="btn" type="submit" disabled={act.busy}>
            Save adults and drivers
          </button>
        </div>
      ) : null}
    </form>
  );
}
