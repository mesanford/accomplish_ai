import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { GLOSSARY, ROLE_GUIDES } from '../lib/help';
import { useTroop } from '../lib/troop';

export function HelpPage() {
  const { has, isLeader } = useTroop();
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const mine = new Set<string>([
    ...(isLeader ? ['leader'] : []),
    ...(has('parent') ? ['parent'] : []),
    ...(has('scout') ? ['scout'] : []),
    ...(has('counselor') ? ['counselor'] : []),
  ]);
  const guides = ROLE_GUIDES.map((g) => ({
    ...g,
    tasks: g.tasks.filter((t) => !q || `${t.task} ${t.steps.join(' ')}`.toLowerCase().includes(q)),
  })).filter((g) => g.tasks.length > 0);
  const terms = GLOSSARY.filter((g) => !q || `${g.term} ${g.meaning}`.toLowerCase().includes(q));
  return (
    <>
      <PageHeader eyebrow="Help" title="How to use Trailhead" />
      <p className="muted">Pick the description that fits you. Each task is a few short steps. Words used in Scouting are explained at the bottom.</p>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="help-search">Search help</label>
        <input id="help-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="For example: blue card" />
      </div>
      {guides.map((g) => (
        <details key={g.id} className="card help-guide" open={Boolean(q) || mine.has(g.id)}>
          <summary>
            <h2>{g.title}</h2>
          </summary>
          {g.tasks.map((t) => (
            <div key={t.task} className="stack">
              <h3>{t.task}</h3>
              <ol className="guide-steps">
                {t.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </details>
      ))}
      <section className="stack" aria-labelledby="glossary-h">
        <h2 id="glossary-h">Scouting words, explained</h2>
        {terms.length === 0 && guides.length === 0 ? <p className="muted">Nothing matches that search. Try a shorter word.</p> : null}
        <dl className="glossary">
          {terms.map((t) => (
            <div key={t.term}>
              <dt>{t.term}</dt>
              <dd>{t.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
