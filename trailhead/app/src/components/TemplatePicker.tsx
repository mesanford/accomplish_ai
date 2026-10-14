import { collection, query, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { awardName } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { type ApplyMode, applyTemplate } from '../lib/templates';
import { useTroop } from '../lib/troop';
import type { PathItemDoc, PathTemplate, Progress } from '../lib/types';
import { formatDate, todayIso } from './ui';

interface Props {
  scoutId: string;
  items: PathItemDoc[];
  onApply: (items: PathItemDoc[], goalAwardId: string | null) => void;
}

export function TemplatePicker({ scoutId, items, onApply }: Props) {
  const { troopId } = useTroop();
  const templatesQ = useMemo(() => collection(db, `troops/${troopId}/pathTemplates`), [troopId]);
  const progressQ = useMemo(
    () => query(collection(db, `troops/${troopId}/progress`), where('scoutId', '==', scoutId)),
    [troopId, scoutId],
  );
  const templates = useQuery<PathTemplate>(templatesQ, `${troopId}/templates`);
  const progress = useQuery<Progress>(progressQ, `${troopId}/progress/${scoutId}`);
  const [chosenId, setChosenId] = useState('');
  const [message, setMessage] = useState('');
  const active = templates.data.filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name));
  const chosen = active.find((t) => t.id === chosenId);
  const earned = progress.data.filter((p) => p.status === 'complete').map((p) => p.awardId);
  const today = todayIso();

  if (active.length === 0) {
    return null;
  }

  function apply(mode: ApplyMode) {
    if (!chosen) {
      return;
    }
    const result = applyTemplate({ template: chosen, current: items, today, mode, earned });
    onApply(result.items, mode === 'replace' ? chosen.goalAwardId : null);
    const left = result.skipped.length > 0 ? ` Left out ${result.skipped.length} already earned or planned.` : '';
    setMessage(`Added ${result.added.length} badges from "${chosen.name}".${left}`);
    setChosenId('');
  }

  const preview = chosen ? applyTemplate({ template: chosen, current: [], today, mode: 'replace', earned }) : null;
  return (
    <section className="card">
      <h2>Start from a template</h2>
      <select aria-label="Start from a template" value={chosenId} onChange={(e) => setChosenId(e.target.value)} style={{ maxWidth: 420 }}>
        <option value="">Choose a template…</option>
        {active.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {chosen && preview ? (
        <div className="stack">
          {chosen.description ? <p className="muted">{chosen.description}</p> : null}
          <p>
            This adds {preview.added.length} badges, with dates counted from today ({formatDate(today)}):
          </p>
          <ul>
            {preview.added.map((i) => (
              <li key={i.awardId}>
                {awardName(i.awardId)}: {formatDate(i.plannedStart)} to {formatDate(i.plannedEnd)}
              </li>
            ))}
          </ul>
          {preview.skipped.length > 0 ? (
            <p className="small muted">Skipped because already earned: {preview.skipped.map(awardName).join(', ')}.</p>
          ) : null}
          <div className="row">
            <button type="button" className="btn" onClick={() => apply('replace')}>
              Replace current plan
            </button>
            <button type="button" className="btn secondary" onClick={() => apply('add')}>
              Add to current plan
            </button>
            <button type="button" className="btn quiet" onClick={() => setChosenId('')}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
