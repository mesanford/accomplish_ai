import { useState } from 'react';
import { BADGES, badge } from '../lib/catalog';
import { parseBadgeList } from '../lib/priorImport';
import { Field, Notice } from './ui';

export interface BadgeEntry {
  awardId: string;
  date: string;
}

interface Props {
  entries: BadgeEntry[];
  onChange: (entries: BadgeEntry[]) => void;
}

/** Completed merit badges: add them one at a time, or paste a list. */
export function PriorBadges({ entries, onChange }: Props) {
  const [adding, setAdding] = useState('');
  const [pasted, setPasted] = useState('');
  const [fallback, setFallback] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const listed = new Set(entries.map((e) => e.awardId));

  function addFromList() {
    const { matched, unmatched } = parseBadgeList(pasted, fallback);
    const fresh = matched.filter((m) => !listed.has(m.awardId)).map(({ awardId, date }) => ({ awardId, date }));
    onChange([...entries, ...fresh]);
    setProblems(unmatched.map((u) => `${u.reason}: “${u.line}”`));
    setPasted(unmatched.map((u) => u.line).join('\n'));
  }

  return (
    <div className="stack">
      {entries.length > 0 ? (
        <ul className="list">
          {entries.map((e, i) => (
            <li key={e.awardId}>
              <span>{badge(e.awardId)?.name ?? e.awardId}</span>
              <span className="row">
                <input
                  type="date"
                  required
                  aria-label={`${badge(e.awardId)?.name} completed`}
                  value={e.date}
                  onChange={(ev) => onChange(entries.map((x, n) => (n === i ? { ...x, date: ev.target.value } : x)))}
                  style={{ width: 'auto' }}
                />
                <button type="button" className="btn quiet small" onClick={() => onChange(entries.filter((_, n) => n !== i))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <select
        aria-label="Add a completed merit badge"
        value={adding}
        onChange={(e) => {
          if (e.target.value) {
            onChange([...entries, { awardId: e.target.value, date: '' }]);
          }
          setAdding('');
        }}
        style={{ maxWidth: 360 }}
      >
        <option value="">Add a completed merit badge…</option>
        {BADGES.filter((b) => !listed.has(b.id)).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <details>
        <summary>Paste a list instead</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <Field label="One badge per line, with its date" htmlFor="prior-paste" hint="For example “Camping, 07/15/2024”. Copying rows from Scoutbook or a spreadsheet works.">
            <textarea id="prior-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </Field>
          <Field label="Date for lines without one (optional)" htmlFor="prior-fallback">
            <input id="prior-fallback" type="date" value={fallback} onChange={(e) => setFallback(e.target.value)} style={{ maxWidth: 200 }} />
          </Field>
          <div>
            <button type="button" className="btn secondary small" onClick={addFromList} disabled={!pasted.trim()}>
              Add badges from list
            </button>
          </div>
          {problems.length > 0 ? (
            <Notice kind="warn">
              {problems.length === 1 ? 'One line still needs' : `${problems.length} lines still need`} attention: {problems.join('; ')}
            </Notice>
          ) : null}
        </div>
      </details>
    </div>
  );
}
