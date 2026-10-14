import { ref, uploadBytes } from 'firebase/storage';
import { type ChangeEvent, useId, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { storage } from '../../lib/firebase';
import { imageProblem, uploadPath } from '../../lib/site';
import { Notice } from '../ui';

interface Props {
  troopId: string;
  kind: 'logo' | 'cover' | 'photo';
  label: string;
  hint?: string;
  onUploaded: (path: string) => void;
}

/** Upload one image to this troop's draft folder. Storage rules allow only leaders and images up to 8 MB. */
export function ImageUpload({ troopId, kind, label, hint, onUploaded }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    const problem = imageProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = uploadPath(troopId, kind, file.type, unique);
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      onUploaded(path);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={busy} onChange={choose} />
      {hint ? <span className="hint">{hint}</span> : null}
      {busy ? <span className="muted small">Uploading…</span> : null}
      <Notice kind="error">{error}</Notice>
    </div>
  );
}
