import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Notice, PageHeader, Pips } from '../components/ui';
import { errorMessage } from '../lib/api';
import { BADGE_VERSION, type Badge, CATEGORY_LABELS, eagleLabel, searchBadges } from '../lib/catalog';
import { db } from '../lib/firebase';
import { useTroop } from '../lib/troop';

function StartCard({ b }: { b: Badge }) {
  const { troopId, members, visibleScoutIds } = useTroop();
  const scouts = members.filter((m) => visibleScoutIds.includes(m.id));
  const [scoutId, setScoutId] = useState(scouts[0]?.id ?? '');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  if (scouts.length === 0) {
    return null;
  }

  async function start() {
    setMessage(null);
    try {
      await setDoc(doc(db, `troops/${troopId}/blueCards/${scoutId}_${b.id}`), {
        scoutId,
        awardId: b.id,
        versionId: BADGE_VERSION,
        status: 'requested',
        requestedAt: serverTimestamp(),
      });
      setMessage({ kind: 'ok', text: 'Blue card requested. A leader will approve it and assign a counselor.' });
    } catch (err) {
      const text = errorMessage(err).includes('permission')
        ? 'There is already a blue card for this badge.'
        : errorMessage(err);
      setMessage({ kind: 'error', text });
    }
  }

  return (
    <div className="stack">
      <div className="row">
        {scouts.length > 1 ? (
          <select aria-label="Scout" value={scoutId} onChange={(e) => setScoutId(e.target.value)} style={{ width: 'auto' }}>
            {scouts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="btn secondary small" onClick={start}>
          Start a blue card
        </button>
      </div>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
    </div>
  );
}

export function Badges() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [eagleOnly, setEagleOnly] = useState(false);
  const list = searchBadges(q).filter(
    (b) => (!category || b.category === category) && (!eagleOnly || eagleLabel(b)),
  );
  return (
    <>
      <PageHeader eyebrow="Merit badges" title="Badges">
        <a className="btn quiet small" href="/guide.html" target="_blank" rel="noreferrer">
          Printable field guide
        </a>
      </PageHeader>
      <div className="row">
        <input type="search" placeholder="Search badges" aria-label="Search badges" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={eagleOnly} onChange={(e) => setEagleOnly(e.target.checked)} /> Counts toward Eagle
        </label>
        <span className="muted small">{list.length} badges</span>
      </div>
      <div className="grid">
        {list.map((b) => (
          <article key={b.id} className="card">
            <div className="stack" style={{ gap: 4 }}>
              <h3>{b.name}</h3>
              <span className="row small muted" style={{ gap: 6 }}>
                <Pips level={b.difficulty} /> {b.typicalTime} · {CATEGORY_LABELS[b.category]}
              </span>
              {eagleLabel(b) ? <span><span className="pill eagle">{eagleLabel(b)}</span></span> : null}
            </div>
            <p className="small">{b.summary}</p>
            <p className="small muted">
              <strong>Toughest part:</strong> {b.toughestPart}
            </p>
            <a className="small" href={b.officialUrl} target="_blank" rel="noreferrer">
              Official requirements
            </a>
            <StartCard b={b} />
          </article>
        ))}
      </div>
    </>
  );
}
