import { type FormEvent, useState } from 'react';
import { createInvite, errorMessage } from '../lib/api';
import type { Member } from '../lib/types';
import { Field, Notice } from './ui';

const ROLE_OPTIONS: [string, string][] = [
  ['parent', 'Parent or guardian'],
  ['scout', 'Scout (13 or older)'],
  ['counselor', 'Merit badge counselor'],
  ['leader', 'Leader'],
  ['advancement', 'Advancement chair'],
  ['committee', 'Committee member'],
];

export function InviteForm({ troopId, scouts }: { troopId: string; scouts: Member[] }) {
  const [role, setRole] = useState('parent');
  const [scoutIds, setScoutIds] = useState<string[]>([]);
  const [scoutMemberId, setScoutMemberId] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const unlinked = scouts.filter((s) => !s.uid);

  function toggle(id: string) {
    setScoutIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLink('');
    setCopied(false);
    try {
      const invite = await createInvite({ troopId, role, scoutIds, scoutMemberId: scoutMemberId || undefined });
      setLink(`${window.location.origin}${invite.path}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Invite as" htmlFor="invite-role">
        <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {role === 'parent' ? (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>Parent of</legend>
          {scouts.length === 0 ? <span className="hint">Add the Scout to the roster first.</span> : null}
          {scouts.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={scoutIds.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.displayName}
            </label>
          ))}
        </fieldset>
      ) : null}
      {role === 'scout' ? (
        <Field label="Which Scout" htmlFor="invite-scout" hint="Scouts under 13 can't have their own login; invite a parent.">
          <select id="invite-scout" required value={scoutMemberId} onChange={(e) => setScoutMemberId(e.target.value)}>
            <option value="">Choose a Scout</option>
            {unlinked.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <div>
        <button className="btn" type="submit">
          Create invite link
        </button>
      </div>
      {link ? (
        <div className="stack">
          <span className="small muted">Send this link to them. It works once and expires in 30 days.</span>
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
          <div>
            <button type="button" className="btn secondary small" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
