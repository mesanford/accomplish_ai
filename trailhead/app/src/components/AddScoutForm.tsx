import { type FormEvent, useState } from 'react';
import { addScout, errorMessage, type ParentContact } from '../lib/api';
import { RANKS } from '../lib/catalog';
import { CONSENT_NOTICE_VERSION, mayBeUnder13 } from '../lib/consent';
import { stillNeeded } from '../lib/formCheck';
import { useTroop } from '../lib/troop';
import { ConsentNotice } from './ConsentNotice';
import { HelpTip } from './HelpTip';
import { emptyParent, filledParents, ParentEmailFields, parentsProblem } from './ParentEmailFields';
import { Field, Notice } from './ui';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function AddScoutForm({ troopId, onAdded }: { troopId: string; onAdded?: (id: string) => void }) {
  const { troop, isLeader, has } = useTroop();
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('1');
  const [rank, setRank] = useState('scout');
  const [confirmed, setConfirmed] = useState(false);
  const [mine, setMine] = useState(false);
  const [parents, setParents] = useState<ParentContact[]>([emptyParent()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  // A parent adding their own child agrees to the notice, and so does a leader who ticks "This is my child".
  // Otherwise, for a Scout who may be under 13, a leader gives the parents' emails and each parent agrees by email.
  const isParent = isLeader ? mine : has('parent');
  const needsParentEmail = !isParent && mayBeUnder13(Number(year), Number(month), new Date());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    const missing = stillNeeded([
      ["the Scout's name", name],
      ['the birth year', year],
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    if (!/^\d{4}$/.test(year.trim())) {
      setError('Enter the birth year as four digits, like 2013.');
      return;
    }
    if (isParent && !confirmed) {
      setError('Tick the box to agree before adding your Scout.');
      return;
    }
    const parentProblem = needsParentEmail ? parentsProblem(parents) : null;
    if (parentProblem) {
      setError(parentProblem);
      return;
    }
    setBusy(true);
    try {
      const { scoutId } = await addScout({
        troopId,
        displayName: name.trim(),
        birthYear: Number(year),
        birthMonth: Number(month),
        currentRankId: rank,
        ...(isParent ? { consent: confirmed, consentVersion: CONSENT_NOTICE_VERSION } : {}),
        ...(isLeader && mine ? { isMyChild: true } : {}),
        ...(needsParentEmail ? { parents: filledParents(parents) } : {}),
      });
      setDone(
        needsParentEmail
          ? `Added ${name.trim()}. We emailed the parent. ${name.trim()} stays a name on the roster until a parent agrees.`
          : `Added ${name.trim()}.`,
      );
      setParents([emptyParent()]);
      setName('');
      setYear('');
      setConfirmed(false);
      setMine(false);
      onAdded?.(scoutId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
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
      {isLeader ? (
        <label className="check">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setMine(e.target.checked);
              setConfirmed(false);
            }}
          />
          This is my child
        </label>
      ) : null}
      {isParent ? (
        <>
          <ConsentNotice troopName={troop?.name ?? 'Your troop'} />
          <label className="check">
            <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I am this Scout's parent or guardian, and I agree.
          </label>
        </>
      ) : null}
      {needsParentEmail ? (
        <>
          <p className="small">
            This Scout may be under 13, so only a parent or guardian can give permission. We email them a link to read the
            notice and agree. Until a parent agrees, nothing else is kept for this Scout. If nobody answers in 30 days, the
            Scout and the email addresses are deleted.
          </p>
          <ParentEmailFields parents={parents} onChange={setParents} idPrefix="add-parent" />
        </>
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
