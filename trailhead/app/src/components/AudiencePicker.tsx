import { Field } from './ui';
import { AUDIENCE_CHOICES, type AudienceSpec, type AudienceType } from '../lib/announcements';
import type { Member, TroopEvent } from '../lib/types';

interface Props {
  value: AudienceSpec;
  onChange: (next: AudienceSpec) => void;
  scouts: Member[];
  events: TroopEvent[];
}

/** Who an announcement is for. Parents of chosen Scouts shows a Scout list; an event audience shows an event list. */
export function AudiencePicker({ value, onChange, scouts, events }: Props) {
  const chosen = value.scoutIds ?? [];
  return (
    <>
      <Field label="Who is this for?" htmlFor="ann-audience">
        <select
          id="ann-audience"
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value as AudienceType })}
        >
          {AUDIENCE_CHOICES.map((c) => (
            <option key={c.type} value={c.type}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {value.type === 'parentsOf' ? (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>Scouts</legend>
          <div className="row">
            {scouts.map((s) => (
              <label key={s.id} className="check">
                <input
                  type="checkbox"
                  checked={chosen.includes(s.id)}
                  onChange={() =>
                    onChange({ ...value, scoutIds: chosen.includes(s.id) ? chosen.filter((x) => x !== s.id) : [...chosen, s.id] })
                  }
                />
                {s.displayName}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {value.type === 'event' ? (
        <Field
          label="Event"
          htmlFor="ann-event"
          hint="Reaches everyone signed up, and the parents of signed-up Scouts under 13."
        >
          <select id="ann-event" value={value.eventId ?? ''} onChange={(e) => onChange({ ...value, eventId: e.target.value })}>
            <option value="">Choose an event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </>
  );
}

/** True when the audience has what it needs to be posted. */
export function audienceReady(a: AudienceSpec): boolean {
  if (a.type === 'parentsOf') {
    return (a.scoutIds ?? []).length > 0;
  }
  return a.type === 'event' ? Boolean(a.eventId) : true;
}
