import { useEffect, useState } from 'react';
import { RequirementsToggle } from '../components/AwardRequirements';
import { GuideBlock } from '../components/GuideBlock';
import { HelpTip } from '../components/HelpTip';
import { StartCard } from '../components/StartCard';
import { TipPill } from '../components/TipPill';
import { PageHeader, Pips } from '../components/ui';
import { CATEGORY_LABELS, discontinuedLabel, eagleLabel, searchBadges } from '../lib/catalog';
import { DISCONTINUED_TIP, EAGLE_GROUP_TIP, EAGLE_REQUIRED_TIP } from '../lib/moreStatusTips';
import { firstPage, PAGE_SIZE } from '../lib/paging';
import { plural } from '../lib/plural';

export function Badges() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [eagleOnly, setEagleOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  // A new search or filter starts again from the first page.
  useEffect(() => setLimit(PAGE_SIZE), [q, category, eagleOnly]);
  const list = searchBadges(q).filter(
    (b) => (!category || b.category === category) && (!eagleOnly || eagleLabel(b)),
  );
  const { items, remaining } = firstPage(list, limit);
  return (
    <>
      <PageHeader eyebrow="Merit badges" title="Badges">
        <a className="btn quiet small" href="/guide.html" target="_blank" rel="noreferrer">
          Printable field guide
        </a>
      </PageHeader>
      <GuideBlock
        id="badges"
        purpose="Merit badges are things a Scout learns with an approved adult called a counselor. Browse them here."
        steps={[
          'Search or filter to find a badge.',
          'Read the summary and the toughest part, or open the requirements.',
          'Press "Start a blue card" to ask for it. The Scoutmaster or advancement chair approves and assigns a counselor.',
        ]}
      />
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
          <HelpTip topic="eagleRequired" />
        </label>
        <span className="muted small">{plural(list.length, 'badge')}</span>
        <span className="muted small">
          Squares = difficulty
          <HelpTip topic="difficulty" />
        </span>
        <span className="muted small">
          Blue card?
          <HelpTip topic="blueCard" />
        </span>
      </div>
      <div className="grid">
        {items.map((b) => (
          <article key={b.id} className="card">
            <div className="stack" style={{ gap: 4 }}>
              <h3>{b.name}</h3>
              <span className="row small muted" style={{ gap: 6 }}>
                <Pips level={b.difficulty} /> {b.typicalTime} · {CATEGORY_LABELS[b.category]}
              </span>
              {eagleLabel(b) ? (
                <span>
                  <TipPill tone="eagle" tip={b.eagleRequired ? EAGLE_REQUIRED_TIP : EAGLE_GROUP_TIP}>
                    {eagleLabel(b)}
                  </TipPill>
                </span>
              ) : null}
              {discontinuedLabel(b) ? (
                <span>
                  <TipPill tone="warn" tip={DISCONTINUED_TIP}>
                    {discontinuedLabel(b)}
                  </TipPill>
                </span>
              ) : null}
            </div>
            <p className="small">{b.summary}</p>
            <p className="small muted">
              <strong>Toughest part:</strong> {b.toughestPart}
            </p>
            <a className="small" href={b.officialUrl} target="_blank" rel="noreferrer">
              Official requirements
            </a>
            <RequirementsToggle awardId={b.id} label="requirements" />
            <StartCard b={b} />
          </article>
        ))}
      </div>
      {list.length === 0 ? <p className="muted">No badges match. Try a different search.</p> : null}
      {remaining > 0 ? (
        <div className="row">
          <button type="button" className="btn quiet" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Show more badges
          </button>
          <span className="muted small">
            Showing {items.length} of {list.length}
          </span>
        </div>
      ) : null}
    </>
  );
}
