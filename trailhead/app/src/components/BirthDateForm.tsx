import { type FormEvent, useState } from 'react';
import { errorMessage } from '../lib/api';
import { setScoutBirth } from '../lib/scoutBirthApi';
import type { ScoutRecord } from '../lib/types';
import { MONTHS } from './AddScoutForm';
import { HelpTip } from './HelpTip';
import { Field, Notice } from './ui';

/**
 * A leader corrects a Scout's birth month and year, for example one added before they were asked for. If the new
 * date means the Scout may be under 13 and no parent has agreed yet, the server puts them on hold until one does.
 */
export function BirthDateForm({ troopId, scoutId, record }: { troopId: string; scoutId: string; record: ScoutRecord }) {
  const [month, setMonth] = useState(String(record.birthMonth ?? ''));
  const [year, setYear] = useState(String(record.birthYear ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    if (!month || !year) {
      setError('Choose the birth month and enter the year.');
      return;
    }
    setBusy(true);
    try {
      const { held } = await setScoutBirth({ troopId, scoutId, birthMonth: Number(month), birthYear: Number(year) });
      setDone(
        held
          ? 'Saved. This Scout may be under 13, so a parent now needs to agree before anything else is recorded. Enter a parent’s email on the Roster.'
          : 'Saved.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save} noValidate aria-label="Birth month and year">
      <p className="small muted">
        Used to check the Scout’s age, for example for parent consent and the recharter. We keep only the month and year.
        <HelpTip topic="birthMonth" label="why we ask about age" />
      </p>
      <div className="row">
        <Field label="Birth month" htmlFor={`birth-month-${scoutId}`}>
          <select id={`birth-month-${scoutId}`} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Choose…</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Birth year" htmlFor={`birth-year-${scoutId}`}>
          <input
            id={`birth-year-${scoutId}`}
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </Field>
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save birth month and year'}
        </button>
      </div>
    </form>
  );
}
