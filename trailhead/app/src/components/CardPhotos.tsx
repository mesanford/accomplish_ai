import { getDownloadURL, ref } from 'firebase/storage';
import { type ChangeEvent, useEffect, useState } from 'react';
import { errorMessage } from '../lib/api';
import { attachCardFiles } from '../lib/cardPhotos';
import { storage } from '../lib/firebase';
import type { BlueCard } from '../lib/types';
import { Notice } from './ui';

function CardFile({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    getDownloadURL(ref(storage, path))
      .then((u) => live && setUrl(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [path]);
  if (failed) {
    return <span className="small muted">{label} couldn't be loaded.</span>;
  }
  if (!url) {
    return <span className="small muted">Loading {label}…</span>;
  }
  const pdf = path.toLowerCase().endsWith('.pdf');
  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}>
      {pdf ? (
        <span className="pill neutral">PDF {label}</span>
      ) : (
        <img src={url} alt={label} style={{ height: 72, borderRadius: 6, objectFit: 'cover' }} />
      )}
    </a>
  );
}

interface Props {
  troopId: string;
  card: Pick<BlueCard, 'id' | 'scoutId' | 'photoPaths'>;
  /** Leaders add photos; families only see them. */
  canAdd?: boolean;
}

/** Photos or scans of the paper blue card, shown as small previews that open full size. */
export function CardPhotos({ troopId, card, canAdd }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paths = card.photoPaths ?? [];

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await attachCardFiles(troopId, card, files);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (paths.length === 0 && !canAdd) {
    return null;
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      {paths.length > 0 ? (
        <div className="row" aria-label="Photos of the paper card">
          {paths.map((p, i) => (
            <CardFile key={p} path={p} label={`Paper card photo ${i + 1}`} />
          ))}
        </div>
      ) : null}
      {canAdd ? (
        <label className="small">
          <span className="muted">Add a photo or scan of the paper card </span>
          <input
            type="file"
            aria-label={`Add photos of the paper card for ${card.id}`}
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            multiple
            disabled={busy}
            onChange={choose}
          />
        </label>
      ) : null}
      {busy ? <span className="small muted">Uploading…</span> : null}
      <Notice kind="error">{error}</Notice>
    </div>
  );
}
