import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpTip } from '../components/HelpTip';
import { Field, Notice, PageHeader } from '../components/ui';
import { createTroop, errorMessage, type TroopForm } from '../lib/api';
import { CREATOR_CHOICES, creatorHint, DEFAULT_CREATOR_ROLE } from '../lib/creatorRole';
import { stillNeeded } from '../lib/formCheck';

const EMPTY: TroopForm = { name: '', unitNumber: '', council: '', displayName: '', yptExpiresAt: '', creatorRole: DEFAULT_CREATOR_ROLE };

export function CreateTroop() {
  const navigate = useNavigate();
  const [form, setForm] = useState<TroopForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof TroopForm) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const missing = stillNeeded([
      ['the troop name', form.name],
      ['the unit number', form.unitNumber],
      ['your name', form.displayName],
      ['the date your Youth Protection training expires', form.yptExpiresAt],
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    try {
      const { troopId } = await createTroop(form);
      navigate(`/t/${troopId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="New troop" title="Create a troop" />
      <p className="muted">
        You'll be the troop's first leader, with the role you pick below. After this, you will add your Scouts and invite parents and counselors.
        <HelpTip topic="roles" />
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Troop name" htmlFor="name">
          <input id="name" required value={form.name} onChange={set('name')} placeholder="Troop 101" />
        </Field>
        <Field label="Unit number" htmlFor="unit">
          <input id="unit" required value={form.unitNumber} onChange={set('unitNumber')} inputMode="numeric" />
        </Field>
        <Field label="Council" htmlFor="council" hint="Optional. For example, the name of your local Scouting council.">
          <input id="council" value={form.council} onChange={set('council')} />
        </Field>
        <Field label="Your name" htmlFor="you">
          <input id="you" required value={form.displayName} onChange={set('displayName')} autoComplete="name" />
        </Field>
        <Field label="Your role in the troop" htmlFor="creator-role" hint={creatorHint(form.creatorRole ?? DEFAULT_CREATOR_ROLE)}>
          <select id="creator-role" value={form.creatorRole} onChange={set('creatorRole')}>
            {CREATOR_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Youth Protection training expires"
          htmlFor="ypt"
          hint="Leaders need current training to sign off requirements and message Scouts."
        >
          <input id="ypt" type="date" required value={form.yptExpiresAt} onChange={set('yptExpiresAt')} />
        </Field>
        <p className="small muted">
          Not sure what this is?
          <HelpTip topic="ypt" />
        </p>
        <Notice kind="error">{error}</Notice>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create troop'}
          </button>
        </div>
      </form>
    </>
  );
}
