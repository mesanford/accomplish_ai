import { type ChangeEvent, useState } from 'react';
import { photoProblem } from '../../lib/photo';
import { Field, Notice } from '../ui';

export const PHOTO_HINT = 'Photos of gear only. Do not include Scouts or other people. JPEG, PNG or WebP.';

interface Props {
  id: string;
  label?: string;
  disabled?: boolean;
  /** Called with the chosen file, or null when the choice was cleared or refused. */
  onFile: (file: File | null) => void;
}

/** A file picker for a gear photo, with the reminder that pictures should not show Scouts. */
export function PhotoField({ id, label = 'Photo (optional)', disabled, onFile }: Props) {
  const [error, setError] = useState('');
  function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    const problem = file ? photoProblem(file) : null;
    setError(problem ?? '');
    onFile(problem ? null : file);
  }
  return (
    <Field label={label} htmlFor={id} hint={PHOTO_HINT}>
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={choose} />
      <Notice kind="error">{error}</Notice>
    </Field>
  );
}
