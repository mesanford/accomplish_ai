import { type FormEvent, useState } from 'react';
import { errorMessage, saveTroopSettings, type TroopSettingsForm } from '../../lib/api';
import { stillNeeded } from '../../lib/formCheck';
import { ZONES } from '../../lib/timeZones';
import type { MeetingPlace } from '../../lib/types';
import { Field, Notice } from '../ui';

/** The troop's name, unit number, council, district, chartered organization, meeting place and time zone. */
export function TroopDetailsForm({ saved }: { saved: TroopSettingsForm }) {
  const [form, setForm] = useState(saved);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (key: 'name' | 'unitNumber' | 'council' | 'district' | 'charterOrg' | 'timezone') =>
    (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const setPlace = (key: keyof MeetingPlace) => (e: { target: { value: string } }) =>
    setForm({ ...form, meetingPlace: { ...form.meetingPlace, [key]: e.target.value } });

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const missing = stillNeeded([
      ['the troop name', form.name],
      ['the unit number', form.unitNumber],
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    try {
      // Positions are saved in their own section; send the saved ones so this form never changes them.
      await saveTroopSettings({ ...form, positions: saved.positions });
      setMessage('Saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="form" onSubmit={save} noValidate>
      <div className="row">
        <Field label="Troop name" htmlFor="set-name">
          <input id="set-name" maxLength={80} value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Unit number" htmlFor="set-unit">
          <input id="set-unit" maxLength={10} value={form.unitNumber} onChange={set('unitNumber')} inputMode="numeric" />
        </Field>
      </div>
      <div className="row">
        <Field label="Council" htmlFor="set-council">
          <input id="set-council" maxLength={80} value={form.council} onChange={set('council')} />
        </Field>
        <Field label="District" htmlFor="set-district">
          <input id="set-district" maxLength={80} value={form.district} onChange={set('district')} />
        </Field>
      </div>
      <Field label="Chartered organization" htmlFor="set-charter" hint="The church, school or group that sponsors the troop.">
        <input id="set-charter" maxLength={120} value={form.charterOrg} onChange={set('charterOrg')} />
      </Field>
      <h3>Where the troop meets</h3>
      <Field label="Place" htmlFor="set-place" hint="Such as the church hall or school gym.">
        <input id="set-place" maxLength={120} value={form.meetingPlace.place} onChange={setPlace('place')} />
      </Field>
      <Field label="Street address" htmlFor="set-street">
        <input id="set-street" maxLength={120} value={form.meetingPlace.street} onChange={setPlace('street')} autoComplete="street-address" />
      </Field>
      <div className="row">
        <Field label="City" htmlFor="set-city">
          <input id="set-city" maxLength={80} value={form.meetingPlace.city} onChange={setPlace('city')} />
        </Field>
        <Field label="State" htmlFor="set-state" hint="Two letters, such as IL.">
          <input id="set-state" maxLength={2} value={form.meetingPlace.state} onChange={setPlace('state')} style={{ width: '5em' }} />
        </Field>
        <Field label="ZIP code" htmlFor="set-zip">
          <input id="set-zip" maxLength={10} value={form.meetingPlace.zip} onChange={setPlace('zip')} inputMode="numeric" style={{ width: '8em' }} />
        </Field>
      </div>
      <Field
        label="Time zone"
        htmlFor="set-timezone"
        hint="Decides what “today” is for the troop: sign-off dates, deadlines, reminders and the weekly email."
      >
        <select id="set-timezone" value={form.timezone} onChange={set('timezone')}>
          {ZONES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
      <div>
        <button className="btn" type="submit">
          Save troop details
        </button>
      </div>
    </form>
  );
}
