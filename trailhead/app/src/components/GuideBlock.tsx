import { useState } from 'react';
import { readHidden, writeHidden } from '../lib/guidance';

/**
 * A friendly "How this page works" panel for the top of a page. "Got it, hide this" is remembered
 * in this browser; a small "Show tips" button brings it back. Without storage it still works for the visit.
 */
export function GuideBlock({ id, title, purpose, steps }: { id: string; title?: string; purpose: string; steps: string[] }) {
  const [hidden, setHidden] = useState(() => readHidden(`guide.${id}`));
  function set(value: boolean) {
    setHidden(value);
    writeHidden(`guide.${id}`, value);
  }
  if (hidden) {
    return (
      <div className="guide-collapsed no-print">
        <button type="button" className="btn quiet small" onClick={() => set(false)}>
          Show tips
        </button>
      </div>
    );
  }
  return (
    <section className="guide no-print" aria-label={title ?? 'How this page works'}>
      <h2>{title ?? 'How this page works'}</h2>
      <p>{purpose}</p>
      <ol>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div>
        <button type="button" className="btn quiet small" onClick={() => set(true)}>
          Got it, hide this
        </button>
      </div>
    </section>
  );
}
