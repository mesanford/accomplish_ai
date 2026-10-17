import type { Member } from '../lib/types';

interface Props {
  scouts: Member[];
  picked: string[];
  onChange: (ids: string[]) => void;
  legend: string;
}

/** Tick the Scouts a charge applies to. */
export function ScoutChecklist({ scouts, picked, onChange, legend }: Props) {
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: 14 }}>{legend}</legend>
      <div className="row">
        <button type="button" className="btn quiet small" onClick={() => onChange(scouts.map((s) => s.id))}>
          Tick all
        </button>
        <button type="button" className="btn quiet small" onClick={() => onChange([])}>
          Clear
        </button>
      </div>
      {scouts.map((s) => (
        <label key={s.id} className="check">
          <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
          {s.displayName}
        </label>
      ))}
    </fieldset>
  );
}
