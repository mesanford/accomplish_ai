import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { db, storage } from '../../lib/firebase';
import {
  CATEGORIES,
  categoryLabel,
  type DocCategory,
  fileKind,
  formatSize,
  IMAGE_DOC_TYPES,
  type TroopDocument,
  VISIBILITY_LABELS,
  type Visibility,
  visibilityChoices,
} from '../../lib/siteDocs';
import { useTroop } from '../../lib/troop';
import { ScoutTags } from '../site/ScoutTags';
import { Field, Notice } from '../ui';

/** Opens a stored file in a new tab. The address is fetched when the row shows, so the link is a real link. */
function OpenLink({ doc: d }: { doc: TroopDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getDownloadURL(ref(storage, d.storagePath))
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [d.storagePath]);
  if (!url) {
    return <strong>{d.title}</strong>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <strong>{d.title}</strong>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Edit({ d, troopId, onDone }: { d: TroopDocument; troopId: string; onDone: () => void }) {
  const { members } = useTroop();
  const scouts = members.filter((m) => m.kind === 'scout');
  const [title, setTitle] = useState(d.title);
  const [category, setCategory] = useState<DocCategory>(d.category);
  const [visibility, setVisibility] = useState<Visibility>(d.visibility);
  const [tags, setTags] = useState({ scoutIds: d.scoutIds ?? [], noScoutsShown: d.noScoutsShown ?? false });
  const [error, setError] = useState('');
  const choices = visibilityChoices({ category, contentType: d.contentType });
  const shown = choices.includes(visibility) ? visibility : 'members';
  const isImage = IMAGE_DOC_TYPES.includes(d.contentType);

  async function save() {
    if (!title.trim()) {
      setError('Give the document a title.');
      return;
    }
    try {
      await updateDoc(doc(db, 'troops', troopId, 'documents', d.id), {
        title: title.trim(),
        category,
        visibility: shown,
        ...(isImage ? tags : {}),
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="stack">
      <Field label={`Title of ${d.title}`} htmlFor={`edit-title-${d.id}`}>
        <input id={`edit-title-${d.id}`} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={`Category of ${d.title}`} htmlFor={`edit-cat-${d.id}`}>
        <select id={`edit-cat-${d.id}`} value={category} onChange={(e) => setCategory(e.target.value as DocCategory)}>
          {CATEGORIES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Who can see ${d.title}`} htmlFor={`edit-vis-${d.id}`}>
        <select id={`edit-vis-${d.id}`} value={shown} onChange={(e) => setVisibility(e.target.value as Visibility)}>
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
      <div className="row">
        <button type="button" className="btn small" onClick={save}>
          Save changes
        </button>
        <button type="button" className="btn quiet small" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One document: its title as a link, details, and (for leaders) edit and delete. */
export function DocumentRow({ d, troopId, manage }: { d: TroopDocument; troopId: string; manage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    try {
      // The server deletes the file once the record is gone, and takes a public copy off the site.
      await deleteDoc(doc(db, 'troops', troopId, 'documents', d.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const details = [categoryLabel(d.category), fileKind(d.contentType), formatSize(d.size)].filter(Boolean).join(' · ');
  return (
    <li className="card" style={{ background: 'transparent' }}>
      {editing ? (
        <Edit d={d} troopId={troopId} onDone={() => setEditing(false)} />
      ) : (
        <>
          <OpenLink doc={d} />
          <span className="muted small">{details}</span>
          {manage ? <span className={`pill ${d.visibility === 'leaders' ? 'warn' : 'neutral'}`}>{VISIBILITY_LABELS[d.visibility]}</span> : null}
        </>
      )}
      <Notice kind="error">{error}</Notice>
      {manage && !editing ? (
        <div className="row">
          <button type="button" className="btn quiet small" onClick={() => setEditing(true)}>
            Edit {d.title}
          </button>
          {confirming ? (
            <>
              <button type="button" className="btn danger small" onClick={remove}>
                Yes, delete {d.title}
              </button>
              <button type="button" className="btn quiet small" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn quiet small" onClick={() => setConfirming(true)}>
              Delete {d.title}
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
