import type { ParentContact } from '../lib/api';

export const MAX_PARENT_ROWS = 4;
export const emptyParent = (): ParentContact => ({ name: '', email: '' });

/** A message naming what is missing or wrong in the parents a leader typed, or null when they are fine. */
export function parentsProblem(parents: ParentContact[]): string | null {
  const filled = parents.filter((p) => p.name.trim() || p.email.trim());
  if (filled.length === 0) {
    return "Enter a parent or guardian's name and email address.";
  }
  const bad = filled.find((p) => !p.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim()));
  return bad ? 'Each parent or guardian needs a name and a valid email address.' : null;
}

export const filledParents = (parents: ParentContact[]) =>
  parents.filter((p) => p.name.trim() || p.email.trim()).map((p) => ({ name: p.name.trim(), email: p.email.trim() }));

/** One or more parent or guardian name and email rows. */
export function ParentEmailFields({
  parents,
  onChange,
  idPrefix,
}: {
  parents: ParentContact[];
  onChange: (next: ParentContact[]) => void;
  idPrefix: string;
}) {
  const set = (i: number, patch: Partial<ParentContact>) => onChange(parents.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <fieldset className="stack">
      <legend>Parent or guardian</legend>
      {parents.map((p, i) => (
        <div className="row" key={i}>
          <label htmlFor={`${idPrefix}-name-${i}`} className="small">
            {i === 0 ? 'Parent or guardian name' : `Another parent or guardian ${i + 1}: name`}
          </label>
          <input id={`${idPrefix}-name-${i}`} value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
          <label htmlFor={`${idPrefix}-email-${i}`} className="small">
            {i === 0 ? 'Parent or guardian email' : `Another parent or guardian ${i + 1}: email`}
          </label>
          <input id={`${idPrefix}-email-${i}`} type="email" value={p.email} onChange={(e) => set(i, { email: e.target.value })} />
        </div>
      ))}
      {parents.length < MAX_PARENT_ROWS ? (
        <div>
          <button type="button" className="btn quiet small" onClick={() => onChange([...parents, emptyParent()])}>
            Add another parent or guardian
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
