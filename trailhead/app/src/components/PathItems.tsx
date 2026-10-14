import { Fragment, useState } from 'react';
import { BADGES, badge, discontinuedLabel, eagleLabel } from '../lib/catalog';
import type { PathItemDoc } from '../lib/types';
import { AwardRequirements } from './AwardRequirements';
import { Empty, Pips } from './ui';

interface Props {
  items: PathItemDoc[];
  onChange: (items: PathItemDoc[]) => void;
}

const EAGLE_CORE = BADGES.filter((b) => b.eagleRequired).map((b) => b.id);
// One badge from each choose-one group; the first is a sensible default the Scout can swap.
const EAGLE_CHOICES = ['emergency-preparedness', 'environmental-science', 'swimming'];

export function PathItems({ items, onChange }: Props) {
  const [adding, setAdding] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const planned = new Set(items.map((i) => i.awardId));
  const available = BADGES.filter((b) => !planned.has(b.id));

  function update(index: number, patch: Partial<PathItemDoc>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function add(id: string) {
    if (id && !planned.has(id)) {
      onChange([...items, { awardId: id }]);
    }
    setAdding('');
  }

  function addEagleRequired() {
    const missing = [...EAGLE_CORE, ...EAGLE_CHOICES].filter((id) => !planned.has(id));
    onChange([...items, ...missing.map((awardId) => ({ awardId }))]);
  }

  return (
    <div className="stack">
      {items.length === 0 ? <Empty>No badges in the plan yet.</Empty> : null}
      {items.length > 0 ? (
        <div className="table-box">
          <table>
            <thead>
              <tr>
                <th>Badge</th>
                <th>Start</th>
                <th>Finish</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const b = badge(item.awardId);
                return (
                  <Fragment key={item.awardId}>
                  <tr>
                    <td>
                      <div className="stack" style={{ gap: 2 }}>
                        <strong>{b?.name ?? item.awardId}</strong>
                        <span className="row small muted" style={{ gap: 6 }}>
                          <Pips level={b?.difficulty ?? 1} /> {b?.typicalTime}
                          {b && eagleLabel(b) ? <span className="pill eagle">{eagleLabel(b)}</span> : null}
                          {b && discontinuedLabel(b) ? <span className="pill warn">{discontinuedLabel(b)}</span> : null}
                        </span>
                        <span>
                          <button
                            type="button"
                            className="btn quiet small"
                            aria-expanded={shown === item.awardId}
                            onClick={() => setShown(shown === item.awardId ? null : item.awardId)}
                          >
                            {shown === item.awardId ? 'Hide requirements' : 'Requirements'}
                            <span className="sr-only"> for {b?.name}</span>
                          </button>
                        </span>
                      </div>
                    </td>
                    <td>
                      <input type="date" aria-label={`${b?.name} start`} value={item.plannedStart ?? ''} onChange={(e) => update(i, { plannedStart: e.target.value || undefined })} />
                    </td>
                    <td>
                      <input type="date" aria-label={`${b?.name} finish`} value={item.plannedEnd ?? ''} onChange={(e) => update(i, { plannedEnd: e.target.value || undefined })} />
                    </td>
                    <td>
                      <button type="button" className="btn quiet small" onClick={() => onChange(items.filter((_, n) => n !== i))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  {shown === item.awardId ? (
                    <tr>
                      <td colSpan={4}>
                        <AwardRequirements awardId={item.awardId} />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="row">
        <select aria-label="Add a merit badge" value={adding} onChange={(e) => add(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Add a merit badge…</option>
          {available.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn quiet" onClick={addEagleRequired}>
          Add all Eagle-required badges
        </button>
      </div>
    </div>
  );
}
