import { useState } from 'react';
import { roleList } from '../lib/roles';
import type { Member } from '../lib/types';
import { MemberRoles } from './MemberRoles';

function yptLabel(m: Member): { text: string; tone: string } | null {
  if (m.kind !== 'adult' || !(m.roles ?? []).some((r) => r !== 'parent')) {
    return null;
  }
  const expires = m.yptExpiresAt?.toDate();
  if (!expires) {
    return { text: 'No YPT on file', tone: 'bad' };
  }
  if (expires < new Date()) {
    return { text: 'YPT expired', tone: 'bad' };
  }
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  return expires < soon ? { text: 'YPT expires soon', tone: 'warn' } : { text: 'YPT current', tone: 'good' };
}

interface Props {
  adult: Member;
  scouts: Member[];
  /** Scouts a leader linked this person to who are waiting for them to agree to the parent notice. */
  pendingScoutIds: string[];
}

/** One adult on the roster: their roles, children and training, with a way for a leader to change their roles. */
export function AdultRow({ adult, scouts, pendingScoutIds }: Props) {
  const waiting = pendingScoutIds.length > 0;
  const [open, setOpen] = useState(false);
  const ypt = yptLabel(adult);
  const children = [
    ...scouts.filter((s) => (s.guardianIds ?? []).includes(adult.id)).map((s) => s.displayName),
    ...scouts.filter((s) => pendingScoutIds.includes(s.id)).map((s) => `${s.displayName} (waiting to agree)`),
  ];
  return (
    <li>
      <span>
        {adult.displayName} <span className="muted small">· {roleList(adult.roles)}</span>
        {children.length > 0 ? <span className="muted small"> · Parent of {children.join(', ')}</span> : null}
      </span>
      {waiting ? <span className="pill warn">Has not agreed to the parent notice</span> : null}
      {ypt ? <span className={`pill ${ypt.tone}`}>{ypt.text}</span> : null}
      <button type="button" className="btn quiet small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Close' : `Change roles for ${adult.displayName}`}
      </button>
      {open ? <MemberRoles adult={adult} scouts={scouts} pendingScoutIds={pendingScoutIds} onClose={() => setOpen(false)} /> : null}
    </li>
  );
}
