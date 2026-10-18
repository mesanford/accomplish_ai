import type { ReactNode } from 'react';
import { CARD_TIP, PATH_TIP } from '../lib/moreStatusTips';
import type { CardStatus, Feasibility } from '../lib/types';
import type { HelpKey } from '../lib/help';
import { HelpTip } from './HelpTip';
import { TipPill } from './TipPill';

export function Pips({ level }: { level: number }) {
  return (
    <span className="pips" data-d={level} aria-label={`Difficulty ${level} of 5`}>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'ok' | 'warn' | 'info'; children: ReactNode }) {
  if (!children) {
    return null;
  }
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  help,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  /** An explanation offered beside the label (kept outside it, so the field's name is just the label). */
  help?: HelpKey;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {help ? (
        <span className="field-label">
          <label htmlFor={htmlFor}>{label}</label>
          <HelpTip topic={help} />
        </span>
      ) : (
        <label htmlFor={htmlFor}>{label}</label>
      )}
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}

const CARD_LABELS: Record<CardStatus, [string, string]> = {
  requested: ['Requested', 'warn'],
  approved: ['Approved', 'neutral'],
  counselor_assigned: ['Counselor assigned', 'neutral'],
  in_progress: ['In progress', 'neutral'],
  complete: ['Complete', 'good'],
  cancelled: ['Cancelled', 'bad'],
};

export function CardStatusPill({ status }: { status: CardStatus }) {
  const [label, tone] = CARD_LABELS[status];
  return (
    <TipPill tone={tone} tip={CARD_TIP[status]}>
      {label}
    </TipPill>
  );
}

const PATH_LABELS: Record<Feasibility['status'], [string, string]> = {
  ok: ['On track', 'good'],
  at_risk: ['At risk', 'warn'],
  infeasible: ["Won't work as planned", 'bad'],
};

export function PathStatusPill({ status }: { status: Feasibility['status'] }) {
  const [label, tone] = PATH_LABELS[status];
  return (
    <TipPill tone={tone} tip={PATH_TIP[status]}>
      {label}
    </TipPill>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="stack">
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <div className="row spread">
        <h1>{title}</h1>
        {children ? <div className="row">{children}</div> : null}
      </div>
    </header>
  );
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) {
    return '—';
  }
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
