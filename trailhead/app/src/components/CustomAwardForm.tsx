import { type FormEvent, useState } from 'react';
import { errorMessage, saveCustomAward } from '../lib/api';
import { newRow, requirementsChanged, type RequirementRow, rowsFrom } from '../lib/customAwards';
import type { CustomAward, CustomRequirement } from '../lib/types';
import { RequirementRows } from './RequirementRows';
import { Field, Notice } from './ui';

interface Props {
  troopId: string;
  /** The award being edited, with its current requirements. Omit to create a new award. */
  award?: CustomAward;
  current?: CustomRequirement[];
  onSaved: (result: { awardId: string; versionId: string; newVersion: boolean }) => void;
}

export function CustomAwardForm({ troopId, award, current = [], onSaved }: Props) {
  const [name, setName] = useState(award?.name ?? '');
  const [description, setDescription] = useState(award?.description ?? '');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<RequirementRow[]>(() => (award ? rowsFrom(current) : [newRow('1')]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const newVersion = Boolean(award) && requirementsChanged(current, rows);
  const submitLabel = award ? 'Save changes' : 'Create award';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const requirements = rows.map((r) => ({ id: r.id, label: r.label.trim(), text: r.text.trim() }));
      const result = await saveCustomAward({ troopId, awardId: award?.id, name, description, note, requirements });
      onSaved(result);
      setNote('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} style={{ maxWidth: 720 }}>
      <Field label="Award name" htmlFor="ca-name">
        <input id="ca-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description (optional)" htmlFor="ca-desc" hint="What the award is for, in a sentence or two.">
        <textarea id="ca-desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <h3>Requirements</h3>
      <RequirementRows rows={rows} onChange={setRows} />
      {newVersion ? (
        <>
          <Notice kind="warn">
            Saving creates a new version of the requirements. Scouts already working on this award keep their current
            version until a leader moves them from their Scout page.
          </Notice>
          <Field label="What changed (optional)" htmlFor="ca-note" hint="Shown in the version history.">
            <input id="ca-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      ) : null}
      <Notice kind="error">{error}</Notice>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
