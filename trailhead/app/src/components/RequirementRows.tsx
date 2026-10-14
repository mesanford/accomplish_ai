import { moveRow, newRow, type RequirementRow, suggestLabel } from '../lib/customAwards';

interface Props {
  rows: RequirementRow[];
  onChange: (rows: RequirementRow[]) => void;
}

/** Edit an award's requirement list: number and wording per row, with add, remove and reorder. */
export function RequirementRows({ rows, onChange }: Props) {
  function update(index: number, patch: Partial<RequirementRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="stack">
      {rows.map((row, i) => {
        const n = i + 1;
        return (
          <fieldset key={row.key} className="card req-row">
            <legend className="small muted">Requirement {n}</legend>
            <div className="row" style={{ alignItems: 'start' }}>
              <div className="field" style={{ width: 90 }}>
                <label htmlFor={`${row.key}-label`}>Number</label>
                <input
                  id={`${row.key}-label`}
                  aria-label={`Requirement ${n} number`}
                  required
                  maxLength={12}
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 220 }}>
                <label htmlFor={`${row.key}-text`}>What the Scout does</label>
                <textarea
                  id={`${row.key}-text`}
                  aria-label={`Requirement ${n}, what the Scout does`}
                  required
                  maxLength={1000}
                  value={row.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                />
              </div>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn quiet small"
                aria-label={`Move requirement ${n} up`}
                disabled={i === 0}
                onClick={() => onChange(moveRow(rows, i, -1))}
              >
                Up
              </button>
              <button
                type="button"
                className="btn quiet small"
                aria-label={`Move requirement ${n} down`}
                disabled={i === rows.length - 1}
                onClick={() => onChange(moveRow(rows, i, 1))}
              >
                Down
              </button>
              <button
                type="button"
                className="btn danger small"
                aria-label={`Remove requirement ${n}`}
                disabled={rows.length === 1}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <button type="button" className="btn secondary small" onClick={() => onChange([...rows, newRow(suggestLabel(rows))])}>
          Add requirement
        </button>
      </div>
    </div>
  );
}
