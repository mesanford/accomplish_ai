import { type FormEvent, useState } from 'react';
import { createInvite, errorMessage } from '../lib/api';
import { mayBeUnder13 } from '../lib/consent';
import { plural } from '../lib/plural';
import type { Member, ScoutRecord } from '../lib/types';
import { HelpTip } from './HelpTip';
import { Field, Notice } from './ui';

const ROLE_OPTIONS: [string, string][] = [
  ['parent', 'Parent or guardian'],
  ['scout', 'Scout (13 or older)'],
  ['counselor', 'Merit badge counselor'],
  ['leader', 'Leader'],
  ['advancement', 'Advancement chair'],
  ['committee', 'Committee member'],
];

const ROLE_HINTS: Record<string, string> = {
  parent: 'Can see and plan for their own Scouts.',
  scout: 'Signs in for themselves. Must be 13 or older.',
  counselor: 'Signs off merit badges for Scouts assigned to them. Needs current Youth Protection training.',
  leader: 'Can manage everything in the troop.',
  advancement: 'Can manage ranks, badges and records.',
  committee: 'Can see the troop but not change records.',
};

interface Props {
  troopId: string;
  scouts: Member[];
  /** Each Scout's private record (id is the Scout's id), used to leave out Scouts under 13. */
  records?: (ScoutRecord & { id: string })[];
}

export function InviteForm({ troopId, scouts, records = [] }: Props) {
  const [role, setRole] = useState('parent');
  const [scoutIds, setScoutIds] = useState<string[]>([]);
  const [scoutMemberId, setScoutMemberId] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const unlinked = scouts.filter((s) => !s.uid);
  // A Scout under 13 can't have a login (the server refuses), so don't offer one.
  const eligible = unlinked.filter((s) => {
    const r = records.find((x) => x.id === s.id);
    return r && !mayBeUnder13(r.birthYear, r.birthMonth, new Date());
  });
  const hidden = unlinked.length - eligible.length;

  function toggle(id: string) {
    setScoutIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLink('');
    setCopied(false);
    if (role === 'parent' && scoutIds.length === 0) {
      setError('Choose at least one Scout this parent is linked to.');
      return;
    }
    if (role === 'scout' && !scoutMemberId) {
      setError('Choose which Scout this invite is for.');
      return;
    }
    try {
      const invite = await createInvite({ troopId, role, scoutIds, scoutMemberId: scoutMemberId || undefined });
      setLink(`${window.location.origin}${invite.path}`);
      setScoutIds([]);
      setScoutMemberId('');
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
    <form className="form" onSubmit={submit} noValidate>
      <p className="small muted">
        An invite link is a private web address for one person. They open it, sign in and join your troop.
        <HelpTip topic="invite" label="how invitations work" />
      </p>
      <Field label="Invite as" htmlFor="invite-role" hint={ROLE_HINTS[role]}>
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
        <Field label="Which Scout" htmlFor="invite-scout" hint={
            hidden > 0
              ? `${plural(hidden, 'Scout')} under 13 ${hidden === 1 ? "isn't" : "aren't"} listed: they can't have their own login. Invite a parent instead.`
              : "Scouts under 13 can't have their own login; invite a parent."
          }
        >
          <select id="invite-scout" required value={scoutMemberId} onChange={(e) => setScoutMemberId(e.target.value)}>
            <option value="">Choose a Scout</option>
            {eligible.map((s) => (
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
          <span className="small muted">Send this link to them by text or email. It works for one person and stops working in 30 days.</span>
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
