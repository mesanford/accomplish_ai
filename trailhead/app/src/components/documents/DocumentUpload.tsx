import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { db, storage } from '../../lib/firebase';
import {
  CATEGORIES,
  type DocCategory,
  DOC_ACCEPT,
  docProblem,
  docStoragePath,
  IMAGE_DOC_TYPES,
  safeFileName,
  titleFromFileName,
  VISIBILITY_LABELS,
  type Visibility,
  visibilityChoices,
} from '../../lib/siteDocs';
import { useTroop } from '../../lib/troop';
import { Field, Notice } from '../ui';
import { ScoutTags } from '../site/ScoutTags';

/** Add a document: PDF, Word or an image up to 20 MB, with a title, a category and who can see it. */
export function DocumentUpload({ troopId }: { troopId: string }) {
  const { user } = useAuth();
  const { members } = useTroop();
  const scouts = members.filter((m) => m.kind === 'scout');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocCategory>('other');
  const [visibility, setVisibility] = useState<Visibility>('members');
  const [tags, setTags] = useState({ scoutIds: [] as string[], noScoutsShown: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');
  const [inputKey, setInputKey] = useState(0);

  const type = file?.type ?? '';
  const choices = visibilityChoices({ category, contentType: type });
  const shown = choices.includes(visibility) ? visibility : 'members';
  const isImage = IMAGE_DOC_TYPES.includes(type);

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setAdded('');
    const problem = next ? docProblem(next) : null;
    setError(problem ?? '');
    setFile(problem ? null : next);
    if (next && !problem && !title.trim()) {
      setTitle(titleFromFileName(next.name));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !user) {
      setError('Choose a file to add.');
      return;
    }
    if (!title.trim()) {
      setError("Give the document a title.");
      return;
    }
    setBusy(true);
    setError('');
    try {
      const id = doc(collection(db, 'troops', troopId, 'documents')).id;
      const path = docStoragePath(troopId, id, file.name);
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      await setDoc(doc(db, 'troops', troopId, 'documents', id), {
        title: title.trim(),
        category,
        visibility: shown,
        fileName: safeFileName(file.name),
        contentType: file.type,
        size: file.size,
        storagePath: path,
        ...(isImage ? tags : {}),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setAdded(`Added "${title.trim()}".`);
      setFile(null);
      setTitle('');
      setTags({ scoutIds: [], noScoutsShown: false });
      setInputKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} style={{ background: 'transparent' }}>
      <h3>Add a document</h3>
      <Field label="File" htmlFor="doc-file" hint="PDF, Word or image, up to 20 MB.">
        <input key={inputKey} id="doc-file" type="file" accept={DOC_ACCEPT} disabled={busy} onChange={choose} />
      </Field>
      <Field label="Title" htmlFor="doc-title">
        <input id="doc-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Category" htmlFor="doc-category">
        <select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value as DocCategory)}>
          {CATEGORIES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Who can see it"
        htmlFor="doc-visibility"
        hint={
          choices.length < 3
            ? 'Medical forms and older Word (.doc) files can be shared with members or leaders only.'
            : 'Public documents are listed on your troop website after you publish.'
        }
      >
        <select id="doc-visibility" value={shown} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          {choices.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
      </Field>
      {isImage && shown === 'public' ? (
        <ScoutTags subject="this image" noun="image" tags={tags} scouts={scouts} onChange={setTags} />
      ) : null}
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{added}</Notice>
      <div>
        <button type="submit" className="btn" disabled={busy || !file}>
          {busy ? 'Adding…' : 'Add document'}
        </button>
      </div>
    </form>
  );
}
