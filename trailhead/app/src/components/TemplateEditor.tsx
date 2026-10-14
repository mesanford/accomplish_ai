import { type FormEvent, useState } from 'react';
import { BADGES, badge, RANKS } from '../lib/catalog';
import { daysToWeeks, weeksToDays } from '../lib/templates';
import type { PathTemplate, TemplateItem } from '../lib/types';
import { Empty, Field, Notice } from './ui';

export type TemplateDraft = Pick<PathTemplate, 'name' | 'description' | 'goalAwardId' | 'items'>;

interface Props {
  initial: TemplateDraft;
  busy: boolean;
  error: string;
  onSave: (draft: TemplateDraft) => void;
  onCancel: () => void;
}

export function TemplateEditor({ initial, busy, error, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [goal, setGoal] = useState(initial.goalAwardId);
  const [items, setItems] = useState<TemplateItem[]>(initial.items);
  const planned = new Set(items.map((i) => i.awardId));

  function update(index: number, patch: Partial<TemplateItem>) {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function add(id: string) {
    if (id && !planned.has(id)) {
      const last = items[items.length - 1];
      const start = last ? last.startOffsetDays + last.durationDays : 0;
      setItems([...items, { awardId: id, startOffsetDays: start, durationDays: 28 }]);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({ name, description, goalAwardId: goal, items });
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Template name" htmlFor="tpl-name">
        <input id="tpl-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description" hint="Who it is for and what it covers." htmlFor="tpl-desc">
        <textarea id="tpl-desc" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Goal" htmlFor="tpl-goal">
        <select id="tpl-goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
          {RANKS.filter((r) => r.order > 0).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      {items.length === 0 ? <Empty>No badges in this template yet.</Empty> : null}
      {items.length > 0 ? (
        <div className="table-box">
          <table>
            <thead>
              <tr>
                <th>Badge</th>
                <th>Starts after (weeks)</th>
                <th>Takes (weeks)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const label = badge(item.awardId)?.name ?? item.awardId;
                return (
                  <tr key={item.awardId}>
                    <td>
                      <strong>{label}</strong>
                      <div className="small muted">{badge(item.awardId)?.typicalTime}</div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        aria-label={`${label} starts after weeks`}
                        value={daysToWeeks(item.startOffsetDays)}
                        onChange={(e) => update(i, { startOffsetDays: weeksToDays(Number(e.target.value)) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        aria-label={`${label} takes weeks`}
                        value={daysToWeeks(item.durationDays)}
                        onChange={(e) => update(i, { durationDays: Math.max(1, weeksToDays(Number(e.target.value))) })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn quiet small" onClick={() => setItems(items.filter((_, n) => n !== i))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <select aria-label="Add a merit badge" value="" onChange={(e) => add(e.target.value)} style={{ maxWidth: 320 }}>
        <option value="">Add a merit badge…</option>
        {BADGES.filter((b) => !planned.has(b.id)).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <Notice kind="error">{error}</Notice>
      <div className="row">
        <button className="btn" type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save template'}
        </button>
        <button type="button" className="btn quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
