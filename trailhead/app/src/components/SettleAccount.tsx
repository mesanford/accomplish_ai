import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { formatCents } from '../lib/money';
import { settleAccount } from '../lib/moneyApi';
import { useMoneyAccess } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';
import type { Member } from '../lib/types';
import { Field, Notice } from './ui';

/** Siblings: other Scouts on the roster with a parent in common. */
export function siblingsOf(scout: Member, members: Member[]): Member[] {
  const family = new Set(scout.guardianIds ?? []);
  return members.filter(
    (m) => m.kind === 'scout' && m.id !== scout.id && (m.guardianIds ?? []).some((g) => family.has(g)),
  );
}

/** The treasurer settles the balance of a Scout who left: to the general fund or a sibling. Never cash. */
export function SettleAccount({ scout, balance }: { scout: Member; balance: number }) {
  const { troopId, members } = useTroop();
  const { settings } = useMoneyAccess();
  const siblings = siblingsOf(scout, members);
  const [to, setTo] = useState<'general' | 'sibling'>(
    settings.leavingDefault === 'sibling' && siblings.length > 0 ? 'sibling' : 'general',
  );
  const [siblingId, setSiblingId] = useState(siblings[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  if (balance === 0) {
    return <p className="small muted">{scout.displayName} has left the troop. Their balance is settled.</p>;
  }

  async function settle() {
    setBusy(true);
    setError('');
    try {
      const out = await settleAccount({ troopId, scoutId: scout.id, to, ...(to === 'sibling' ? { siblingId } : {}) });
      setDone(`Moved ${formatCents(out.movedCents)}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <h3>Settle the balance</h3>
      <p className="small">
        {scout.displayName} has left the troop with a balance of {formatCents(balance)}. Credit stays with the troop. It
        is never paid out as cash.
      </p>
      <Field label="Move the balance to" htmlFor="settle-to">
        <select id="settle-to" value={to} onChange={(e) => setTo(e.target.value as 'general' | 'sibling')}>
          <option value="general">The troop's general fund</option>
          {siblings.length > 0 && balance > 0 ? <option value="sibling">A sibling in the troop</option> : null}
        </select>
      </Field>
      {to === 'sibling' ? (
        <Field label="Sibling" htmlFor="settle-sibling">
          <select id="settle-sibling" value={siblingId} onChange={(e) => setSiblingId(e.target.value)}>
            {siblings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div className="row">
        <button type="button" className="btn small" disabled={busy} onClick={settle}>
          {busy ? 'Moving…' : 'Move the balance'}
        </button>
      </div>
    </div>
  );
}
