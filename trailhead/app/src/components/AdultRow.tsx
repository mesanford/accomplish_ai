import { useState } from 'react';
import type { HealthForm } from '../lib/healthForm';
import { roleList } from '../lib/roles';
import type { Member } from '../lib/types';
import { YPT_TEXT, YPT_TONE, yptInfo } from '../lib/ypt';
import { HealthFormCard } from './HealthFormCard';
import { HealthPills } from './HealthPills';
import { MemberRoles } from './MemberRoles';
import { formatDate, todayIso } from './ui';
import { ADULT_PENDING_TIP, yptTip } from '../lib/statusTips';
import { TipPill } from './TipPill';

interface Props {
  adult: Member;
  scouts: Member[];
  /** Scouts a leader linked this person to who are waiting for them to agree to the parent notice. */
  pendingScoutIds: string[];
  health?: HealthForm;
}

/** One adult on the roster: their roles, children and training, with a way for a leader to change their roles. */
export function AdultRow({ adult, scouts, pendingScoutIds, health }: Props) {
  const waiting = pendingScoutIds.length > 0;
  const [open, setOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const ypt = yptInfo(adult, todayIso());
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
      {waiting ? (
        <TipPill tone="warn" tip={ADULT_PENDING_TIP}>
          Has not agreed to the parent notice
        </TipPill>
      ) : null}
      {ypt.status !== 'notRequired' ? (
        <TipPill tone={YPT_TONE[ypt.status]} tip={yptTip(ypt.status)}>
          {YPT_TEXT[ypt.status]}
          {ypt.expires ? `: ${formatDate(ypt.expires)}` : ''}
        </TipPill>
      ) : null}
      {ypt.expires && adult.yptUpdatedBy ? (
        <span className="muted small">{adult.yptUpdatedBy === 'self' ? 'Entered by them' : 'Entered by a leader'}</span>
      ) : null}
      <HealthPills form={health} />
      <button type="button" className="btn quiet small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Close' : `Change roles for ${adult.displayName}`}
      </button>
      <button type="button" className="btn quiet small" aria-expanded={healthOpen} onClick={() => setHealthOpen((v) => !v)}>
        {healthOpen ? 'Close' : `Health form dates for ${adult.displayName}`}
      </button>
      {healthOpen ? <HealthFormCard memberId={adult.id} name={adult.displayName} /> : null}
      {open ? <MemberRoles adult={adult} scouts={scouts} pendingScoutIds={pendingScoutIds} onClose={() => setOpen(false)} /> : null}
    </li>
  );
}
