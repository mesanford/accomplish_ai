import { Field } from '../ui';

export interface SignupValues {
  enabled: boolean;
  capacity: string;
  needsPermission: boolean;
  deadline: string;
}

/** The sign-up settings the event will start with. */
export function SignupFields({ value, onChange }: { value: SignupValues; onChange: (v: SignupValues) => void }) {
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
        Turn on sign-ups
      </label>
      {value.enabled ? (
        <div className="row">
          <Field label="Number of spots" htmlFor="pc-cap" hint="Empty means no limit.">
            <input id="pc-cap" inputMode="numeric" value={value.capacity} onChange={(e) => onChange({ ...value, capacity: e.target.value })} />
          </Field>
          <Field label="Sign up by" htmlFor="pc-deadline">
            <input id="pc-deadline" type="date" value={value.deadline} onChange={(e) => onChange({ ...value, deadline: e.target.value })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={value.needsPermission} onChange={(e) => onChange({ ...value, needsPermission: e.target.checked })} />
            A parent must give permission for each Scout
          </label>
        </div>
      ) : null}
    </div>
  );
}
