import { formatCents } from '../lib/money';

/** An amount in dollars with tabular figures, so columns line up. Below zero is marked in the "bad" colour. */
export function Money({ cents }: { cents: number }) {
  return <span className={cents < 0 ? 'money below' : 'money'}>{formatCents(cents)}</span>;
}

/** A labelled total, as on the troop summary and a Scout's statement. */
export function Total({ label, cents, hint }: { label: string; cents: number; hint?: string }) {
  return (
    <div className="total card">
      <span className="small muted">{label}</span>
      <Money cents={cents} />
      {hint ? <span className="small muted">{hint}</span> : null}
    </div>
  );
}
