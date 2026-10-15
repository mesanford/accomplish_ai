import { type FormEvent, useState } from 'react';
import { addScout, errorMessage } from '../lib/api';
import { RANKS } from '../lib/catalog';
import { CONSENT_NOTICE_VERSION, mayBeUnder13 } from '../lib/consent';
import { useTroop } from '../lib/troop';
import { ConsentNotice } from './ConsentNotice';
import { HelpTip } from './HelpTip';
import { Field, Notice } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function AddScoutForm({ troopId, onAdded }: { troopId: string; onAdded?: (id: string) => void }) {
  const { access, troop } = useTroop();
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('1');
  const [rank, setRank] = useState('scout');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  // A parent adding their own child agrees to the notice. A leader confirms the family's permission for a
  // Scout who may be under 13.
  const isParent = Boolean(access?.roles.includes('parent'));
  const needsLeaderBox = !isParent && mayBeUnder13(Number(year), Number(month), new Date());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const { scoutId } = await addScout({
        troopId,
        displayName: name.trim(),
        birthYear: Number(year),
        birthMonth: Number(month),
        currentRankId: rank,
        ...(isParent ? { consent: confirmed, consentVersion: CONSENT_NOTICE_VERSION } : {}),
        ...(needsLeaderBox ? { leaderConfirmed: confirmed } : {}),
      });
      setDone(`Added ${name.trim()}.`);
      setName('');
      setYear('');
      setConfirmed(false);
      onAdded?.(scoutId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Scout's name" htmlFor="scout-name">
        <input id="scout-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="row">
        <Field label="Birth month" htmlFor="scout-month">
          <select id="scout-month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Birth year" htmlFor="scout-year">
          <input id="scout-year" required inputMode="numeric" pattern="\d{4}" value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
      </div>
      <Field label="Current rank" htmlFor="scout-rank" hint="Add the date of each rank later from the Scout's page.">
        <select id="scout-rank" value={rank} onChange={(e) => setRank(e.target.value)}>
          {RANKS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="hint small muted">
        We keep only birth month and year, never the full birthday.
        <HelpTip topic="birthMonth" label="why we ask about age" />
      </p>
      {isParent ? (
        <>
          <ConsentNotice troopName={troop?.name ?? 'Your troop'} />
          <label className="check">
            <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I am this Scout's parent or guardian, and I agree.
          </label>
        </>
      ) : null}
      {needsLeaderBox ? (
        <label className="check">
          <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          This Scout's parent or guardian has given the troop permission to keep their advancement records in Trailhead,
          for example on their youth application.
        </label>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add Scout'}
        </button>
      </div>
    </form>
  );
}
