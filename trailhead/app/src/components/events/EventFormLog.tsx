import { awardName, BADGES } from '../../lib/catalog';
import { RequirementPicker } from '../RequirementPicker';
import { Field } from '../ui';

type Pair = [string, (value: string) => void];

/** A single event's activity log (nights, miles, hours) and the requirement it covers, on the create form. */
export function LogFields({
  nights: [nights, setNights],
  miles: [miles, setMiles],
  hours: [hours, setHours],
  award: [awardId, setAwardId],
  req: [reqId, setReqId],
}: {
  nights: Pair;
  miles: Pair;
  hours: Pair;
  award: Pair;
  req: Pair;
}) {
  return (
    <>
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
    
    </>
  );
}
