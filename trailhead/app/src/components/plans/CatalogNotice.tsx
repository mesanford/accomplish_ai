import { doc, type Timestamp } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/hooks';
import { formatDate } from '../ui';

interface CatalogMeta {
  finishedAt?: Timestamp;
  summary?: { added?: number; changed?: number; removed?: number };
}

const SEEN_KEY = 'forthright.catalogSeen';

function seen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** "Places updated": shown once after each refresh of the place catalog, until this person dismisses it. */
export function CatalogNotice() {
  const ref = useMemo(() => doc(db, 'catalogMeta/current'), []);
  const meta = useDoc<CatalogMeta>(ref).data;
  const [dismissed, setDismissed] = useState(seen);
  const when = meta?.finishedAt?.toDate?.().toISOString();
  if (!when || dismissed >= when) {
    return null;
  }
  const s = meta?.summary ?? {};
  const parts = [`${s.added ?? 0} new`, `${s.changed ?? 0} changed`];
  if (s.removed) {
    parts.push(`${s.removed} no longer listed`);
  }

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, when as string);
    } catch {
      // A private window: it shows again next time, which is fine.
    }
    setDismissed(when as string);
  }

  return (
    <div className="notice info row spread" role="status">
      <span>
        Places updated {formatDate(when.slice(0, 10))}: {parts.join(', ')}. Find them under Places to look at in a plan.
      </span>
      <button className="btn secondary small" type="button" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
