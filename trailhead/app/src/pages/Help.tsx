import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { GLOSSARY } from '../lib/help';
import { guidesToOpen, ROLE_GUIDES } from '../lib/roleGuides';
import { useTroop } from '../lib/troop';

export function HelpPage() {
  const { has, isLeader } = useTroop();
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const mine = new Set<string>(guidesToOpen(isLeader, has));
  const guides = ROLE_GUIDES.map((g) => {
    const access = `${g.sees.join(' ')} ${g.cannot.join(' ')}`.toLowerCase();
    return {
      ...g,
      showAccess: !q || access.includes(q),
      tasks: g.tasks.filter((t) => !q || `${t.task} ${t.steps.join(' ')}`.toLowerCase().includes(q)),
    };
  }).filter((g) => g.tasks.length > 0 || (q && g.showAccess));
  const terms = GLOSSARY.filter((g) => !q || `${g.term} ${g.meaning}`.toLowerCase().includes(q));
  return (
    <>
      <PageHeader eyebrow="Help" title="How to use Forthright" />
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
          {g.showAccess ? (
            <div className="stack">
              <h3>What you can see and do</h3>
              <ul className="guide-list">
                {g.sees.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <h3>What you cannot see or change</h3>
              <ul className="guide-list">
                {g.cannot.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
        <h2 className="blazed" id="glossary-h">Scouting words, explained</h2>
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
      <p className="muted small">
        How Forthright handles your information: <a href="/privacy">Privacy policy</a>
      </p>
    </>
  );
}
