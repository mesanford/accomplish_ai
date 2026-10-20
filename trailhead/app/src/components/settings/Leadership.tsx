import { collection } from 'firebase/firestore';
import { type FormEvent, useMemo, useState } from 'react';
import { errorMessage, saveTroopSettings, type TroopSettingsForm } from '../../lib/api';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { pendingLinks } from '../../lib/roles';
import { leadershipGaps, whoHolds } from '../../lib/troopSettings';
import type { Access, Member } from '../../lib/types';
import { AdultRow } from '../AdultRow';
import { InviteForm } from '../InviteForm';
import { Field, Notice } from '../ui';

const POSITION_LABELS = {
  committeeChair: 'Committee chair',
  charterRep: 'Chartered organization representative',
} as const;

/** Who leads the troop: key positions, who holds each role, changing an adult's roles, and inviting a leader. */
export function Leadership({ saved, members }: { saved: TroopSettingsForm; members: Member[] }) {
  const [positions, setPositions] = useState(saved.positions);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const accessQ = useMemo(() => collection(db, `troops/${saved.troopId}/access`), [saved.troopId]);
  const logins = useQuery<Access>(accessQ, `${saved.troopId}/access/settings`);
  const pending = pendingLinks(logins.data);
  const adults = members.filter((m) => m.kind === 'adult').sort((a, b) => a.displayName.localeCompare(b.displayName));
  const scouts = members.filter((m) => m.kind === 'scout').sort((a, b) => a.displayName.localeCompare(b.displayName));
  const gaps = leadershipGaps(members);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await saveTroopSettings({ ...saved, positions });
      setMessage('Saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="stack">
      {gaps.map((g) => (
        <Notice key={g} kind="error">
          {g}
        </Notice>
      ))}
      <ul className="stack small" aria-label="Who holds each role">
        {whoHolds(members).map((row) => (
          <li key={row.role}>
            <strong>{row.label}:</strong> {row.names.length ? row.names.join(', ') : <span className="muted">no one yet</span>}
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={save} noValidate>
        <h3>Key positions</h3>
        <div className="row">
          {(Object.keys(POSITION_LABELS) as (keyof typeof POSITION_LABELS)[]).map((key) => (
            <Field key={key} label={POSITION_LABELS[key]} htmlFor={`pos-${key}`}>
              <select
                id={`pos-${key}`}
                value={positions[key] ?? ''}
                onChange={(e) => setPositions({ ...positions, [key]: e.target.value || null })}
              >
                <option value="">No one yet</option>
                {adults.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{message}</Notice>
        <div>
          <button className="btn secondary" type="submit">
            Save positions
          </button>
        </div>
      </form>
      <h3>Adults and their roles</h3>
      <p className="small muted">Open a person to change their roles, such as making them the Scoutmaster or treasurer.</p>
      <ul className="list">
        {adults.map((a) => (
          <AdultRow key={a.id} adult={a} scouts={scouts} pendingScoutIds={pending.get(a.id) ?? []} />
        ))}
      </ul>
      <details className="card">
        <summary>Invite a leader or other adult</summary>
        <InviteForm troopId={saved.troopId} scouts={scouts} />
      </details>
    </div>
  );
}
