import { type FormEvent, useState } from 'react';
import { errorMessage, setMemberRoles } from '../lib/api';
import { joinList } from '../lib/formCheck';
import { ADULT_ROLES, needsTrainingDate, ROLE_LABELS, roleChange, rolesProblem, savedMessage } from '../lib/roles';
import { useTroop } from '../lib/troop';
import type { Member, Role } from '../lib/types';
import { Field, Notice } from './ui';

interface Props {
  adult: Member;
  scouts: Member[];
  onClose: () => void;
}

/** A leader changes the roles an adult holds. Adding "parent" links Scouts; the parent agrees to the notice themselves. */
export function MemberRoles({ adult, scouts, onClose }: Props) {
  const { troopId } = useTroop();
  const before = (adult.roles ?? []).filter((r) => ADULT_ROLES.includes(r));
  const linked = scouts.filter((s) => (s.guardianIds ?? []).includes(adult.id));
  const [roles, setRoles] = useState<Role[]>(before);
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const change = roleChange(before, roles);
  const needsDate = needsTrainingDate(change.added, adult.yptExpiresAt?.toDate(), new Date());
  const others = scouts.filter((s) => !linked.some((l) => l.id === s.id));
  const first = adult.displayName.split(' ')[0] || 'this person';

  const toggleRole = (role: Role) =>
    setRoles((now) => (now.includes(role) ? now.filter((r) => r !== role) : [...now, role]));
  const togglePick = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  async function save(e: FormEvent) {
    e.preventDefault();
    setDone('');
    const problem = rolesProblem(roles, change, picked, needsDate, date);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const out = await setMemberRoles({
        troopId,
        memberId: adult.id,
        roles: ADULT_ROLES.filter((r) => roles.includes(r)),
        ...(roles.includes('parent') ? { scoutIds: [...linked.map((s) => s.id), ...picked] } : {}),
        ...(date ? { yptExpiresAt: date } : {}),
      });
      setDone(savedMessage(adult.displayName, out.pendingScoutIds.length));
      setPicked([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={save} aria-label={`Roles for ${adult.displayName}`}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 14 }}>Roles for {adult.displayName}</legend>
        {ADULT_ROLES.map((role) => (
          <label key={role} className="check">
            <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </fieldset>
      {roles.includes('parent') ? (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>Parent of</legend>
          {linked.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked disabled />
              {s.displayName} (linked)
            </label>
          ))}
          {others.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => togglePick(s.id)} />
              {s.displayName}
            </label>
          ))}
          {change.added.includes('parent') ? (
            <span className="hint small muted">
              {first} agrees to the parent notice the next time they open the troop. Until then they can't see these
              Scouts.
            </span>
          ) : null}
        </fieldset>
      ) : null}
      {change.removed.includes('parent') && linked.length > 0 ? (
        <Notice kind="warn">
          {first} will be unlinked from {joinList(linked.map((s) => s.displayName))}.
        </Notice>
      ) : null}
      {needsDate ? (
        <Field
          label="Youth Protection training expires"
          htmlFor={`ypt-${adult.id}`}
          hint="These roles need current training. Add the date from their certificate."
        >
          <input id={`ypt-${adult.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy || (!change.changed && picked.length === 0)}>
          {busy ? 'Saving…' : 'Save roles'}
        </button>
        <button className="btn quiet small" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}
