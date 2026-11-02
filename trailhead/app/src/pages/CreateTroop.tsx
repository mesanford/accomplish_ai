import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AskToJoin } from '../components/AskToJoin';
import { CouncilInput } from '../components/CouncilInput';
import { HelpTip } from '../components/HelpTip';
import { TroopMatches } from '../components/TroopMatches';
import { Field, Notice, PageHeader } from '../components/ui';
import { YouFields } from '../components/YouFields';
import { createTroop, errorMessage, findTroops, type TroopForm, type TroopMatch } from '../lib/api';
import { DEFAULT_CREATOR_ROLE } from '../lib/creatorRole';
import { stillNeeded } from '../lib/formCheck';
import { browserZone, ZONES } from '../lib/timeZones';

const EMPTY: TroopForm = {
  name: '',
  unitNumber: '',
  council: '',
  district: '',
  displayName: '',
  yptExpiresAt: '',
  creatorRole: DEFAULT_CREATOR_ROLE,
};

/** What the last search for an existing troop was for: a new unit number or council needs a new search. */
const searchKey = (form: TroopForm) => `${form.unitNumber.trim()}|${form.council.trim().toLowerCase()}`;

export function CreateTroop() {
  const navigate = useNavigate();
  const [form, setForm] = useState<TroopForm>(() => ({ ...EMPTY, timezone: browserZone() }));
  const [matches, setMatches] = useState<{ key: string; found: TroopMatch[] }>({ key: '', found: [] });
  const [notMine, setNotMine] = useState(false);
  const [joining, setJoining] = useState<TroopMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof TroopForm) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  /** Look for the troop on Forthright already. Returns what was found; a failed search finds nothing. */
  async function search(): Promise<TroopMatch[]> {
    const key = searchKey(form);
    if (key === matches.key) {
      return matches.found;
    }
    if (!form.unitNumber.trim() || !form.council.trim()) {
      return [];
    }
    const found = await findTroops(form.unitNumber, form.council).then(
      (r) => r.matches,
      () => [],
    );
    setMatches({ key, found });
    setNotMine(false);
    return found;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const missing = stillNeeded([
      ['the troop name', form.name],
      ['the unit number', form.unitNumber],
      ['the council', form.council],
      ['your name', form.displayName],
      ['the date your Youth Protection training expires', form.yptExpiresAt],
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    const found = await search();
    if (found.length > 0 && !notMine) {
      setError(
        found.length === 1
          ? 'This troop may already be on Forthright. Ask to join it, or tick "This is not my troop".'
          : 'Your troop may already be on Forthright. Ask to join it, or tick "None of these is my troop".',
      );
      setBusy(false);
      return;
    }
    try {
      const { troopId } = await createTroop(form);
      navigate(`/t/${troopId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (joining) {
    return <AskToJoin troop={joining} start={form} onBack={() => setJoining(null)} />;
  }

  const shown = matches.key === searchKey(form) ? matches.found : [];
  return (
    <>
      <PageHeader eyebrow="New troop" title="Create a troop" />
      <p className="muted">
        You'll be the troop's first leader, with the role you pick below. After this, you will add your Scouts and invite
        parents and counselors. If your troop is already on Forthright, we'll show it once you enter the unit number and
        council, so you can ask to join it instead.
        <HelpTip topic="roles" />
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Troop name" htmlFor="name">
          <input id="name" required value={form.name} onChange={set('name')} placeholder="Troop 101" />
        </Field>
        <Field
          label="Unit number"
          htmlFor="unit"
          hint="The number your council gave your troop, like 101 in Troop 101. It shows on your troop website."
        >
          <input id="unit" required value={form.unitNumber} onChange={set('unitNumber')} onBlur={search} inputMode="numeric" />
        </Field>
        <Field label="Council" htmlFor="council" hint="Start typing and pick your council from the list.">
          <CouncilInput id="council" required value={form.council} onChange={set('council')} onBlur={search} />
        </Field>
        {shown.length > 0 ? (
          <TroopMatches matches={shown} notMine={notMine} onNotMine={setNotMine} onAsk={setJoining} />
        ) : null}
        <Field label="District" htmlFor="district" hint="Optional. The district within your council.">
          <input id="district" maxLength={80} value={form.district} onChange={set('district')} />
        </Field>
        <Field
          label="Time zone"
          htmlFor="timezone"
          hint="Where the troop meets. Dates, deadlines and reminders follow it. You can change it in Troop settings."
        >
          <select id="timezone" value={form.timezone} onChange={set('timezone')}>
            {ZONES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <YouFields you={form} onChange={(you) => setForm({ ...form, ...you })} />
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
