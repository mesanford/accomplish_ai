import { useState } from 'react';
import { BADGES, badge } from '../lib/catalog';
import { RequirementPicker } from './RequirementPicker';

export interface PartialEntry {
  awardId: string;
  date: string;
  requirements: string;
}

interface Props {
  entries: PartialEntry[];
  exclude: Set<string>;
  onChange: (entries: PartialEntry[]) => void;
}

/** Merit badges started before joining, with the requirements already signed. */
export function PriorPartials({ entries, exclude, onChange }: Props) {
  const [adding, setAdding] = useState('');
  const listed = new Set(entries.map((e) => e.awardId));
  const update = (i: number, patch: Partial<PartialEntry>) =>
    onChange(entries.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  return (
    <div className="stack">
      {entries.map((e, i) => (
        <div key={e.awardId} className="row" style={{ alignItems: 'start' }}>
          <strong style={{ minWidth: 180 }}>{badge(e.awardId)?.name}</strong>
          <RequirementPicker
            awardId={e.awardId}
            multiple
            collapsible
            value={e.requirements.split(/[\s,;]+/).filter(Boolean)}
            onChange={(v) => update(i, { requirements: v.join(', ') })}
            inputLabel={`${badge(e.awardId)?.name} requirements done`}
          />
          <input
            type="date"
            aria-label={`${badge(e.awardId)?.name} last signed`}
            value={e.date}
            onChange={(ev) => update(i, { date: ev.target.value })}
            style={{ width: 'auto' }}
          />
          <button type="button" className="btn quiet small" onClick={() => onChange(entries.filter((_, n) => n !== i))}>
            Remove
          </button>
        </div>
      ))}
      <select
        aria-label="Add a partly finished merit badge"
        value={adding}
        onChange={(e) => {
          if (e.target.value) {
            onChange([...entries, { awardId: e.target.value, date: '', requirements: '' }]);
          }
          setAdding('');
        }}
        style={{ maxWidth: 360 }}
      >
        <option value="">Add a partly finished merit badge…</option>
        {BADGES.filter((b) => !listed.has(b.id) && !exclude.has(b.id)).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
