import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { saveTemplate } from '../lib/templateStore';
import { planToTemplateItems } from '../lib/templates';
import { useTroop } from '../lib/troop';
import type { PathItemDoc } from '../lib/types';
import { Field, Notice } from './ui';

interface Props {
  goalAwardId: string;
  items: PathItemDoc[];
}

/** Lets a leader turn the plan on screen into a troop template. Dates become offsets from the earliest start. */
export function SaveAsTemplate({ goalAwardId, items }: Props) {
  const { troopId, access } = useTroop();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      const draft = { name, description: '', goalAwardId, items: planToTemplateItems(items) };
      await saveTemplate(troopId, access?.memberId ?? '', draft);
      setSaved(`Saved "${name.trim()}". Find it under Path templates.`);
      setOpen(false);
      setName('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Share this plan</h2>
      {open ? (
        <div className="stack">
          <Field label="Template name" htmlFor="save-tpl-name">
            <input id="save-tpl-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="row">
            <button type="button" className="btn" disabled={busy || !name.trim() || items.length === 0} onClick={save}>
              {busy ? 'Saving…' : 'Save template'}
            </button>
            <button type="button" className="btn quiet" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn secondary" disabled={items.length === 0} onClick={() => setOpen(true)}>
            Save this Scout's plan as a template
          </button>
        </div>
      )}
      <Notice kind="error">{error}</Notice>
      {saved ? <p role="status">{saved}</p> : null}
    </section>
  );
}
