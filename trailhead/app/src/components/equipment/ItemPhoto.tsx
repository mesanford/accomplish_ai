import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { setItemPhoto } from '../../lib/equipmentApi';
import { storage } from '../../lib/firebase';
import { shrinkPhoto } from '../../lib/photo';
import { useTroop } from '../../lib/troop';
import { Notice } from '../ui';
import { PhotoField } from './PhotoField';

interface Props {
  itemId: string;
  name: string;
  photoPath?: string;
  manage: boolean;
}

/** The item's photo, with a way for the quartermaster to replace or remove it. */
export function ItemPhoto({ itemId, name, photoPath, manage }: Props) {
  const { troopId } = useTroop();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (photoPath) {
      getDownloadURL(ref(storage, photoPath))
        .then((u) => live && setUrl(u))
        .catch(() => live && setUrl(null));
    }
    return () => {
      live = false;
    };
  }, [photoPath]);

  async function change(file: File | null) {
    if (!file) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setItemPhoto(troopId, itemId, await shrinkPhoto(file));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await setItemPhoto(troopId, itemId, null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack no-print">
      {url ? <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 10 }} /> : null}
      {manage ? (
        <>
          <PhotoField id="photo-change" label={photoPath ? 'Replace the photo' : 'Add a photo'} disabled={busy} onFile={change} />
          {photoPath ? (
            <div>
              <button type="button" className="btn quiet small" disabled={busy} onClick={remove}>
                Remove the photo
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      <Notice kind="error">{error}</Notice>
    </div>
  );
}
