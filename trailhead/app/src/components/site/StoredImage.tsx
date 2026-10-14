import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { storage } from '../../lib/firebase';

/** A draft image from Cloud Storage. Leaders can read their troop's drafts; the URL is fetched on demand. */
export function StoredImage({ path, alt, height = 120 }: { path: string; alt: string; height?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(false);
    getDownloadURL(ref(storage, path))
      .then((u) => {
        if (live) {
          setUrl(u);
        }
      })
      .catch(() => {
        if (live) {
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, [path]);
  if (failed) {
    return <span className="muted small">This image couldn't be loaded. Upload it again.</span>;
  }
  if (!url) {
    return <span className="muted small">Loading image…</span>;
  }
  return <img src={url} alt={alt} style={{ height, maxWidth: '100%', objectFit: 'cover', borderRadius: 8 }} />;
}
