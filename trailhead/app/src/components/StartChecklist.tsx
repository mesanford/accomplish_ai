import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type ChecklistItem, progress, readHidden, writeHidden } from '../lib/guidance';
import type { HelpKey } from '../lib/help';
import { HelpTip } from './HelpTip';

export function Checklist({
  title,
  items,
  dismissKey,
  help,
}: {
  title: string;
  items: ChecklistItem[];
  dismissKey: string;
  /** An explanation to offer beside the title. */
  help?: HelpKey;
}) {
  const [hidden, setHidden] = useState(() => readHidden(dismissKey));
  const { done, total, complete } = progress(items);
  if (hidden || complete) {
    return null;
  }
  return (
    <section className="card getting-started" aria-label={title}>
      <div className="row spread">
        <h2>
          {title}
          {help ? <HelpTip topic={help} /> : null}
        </h2>
        <span className="muted small">
          {done} of {total} done
        </span>
      </div>
      <ul className="steps">
        {items.map((i) => (
          <li key={i.id} className={i.done ? 'done' : ''}>
            <span className="tick" aria-hidden="true">
              {i.done ? '✓' : ''}
            </span>
            <span>
              {i.done ? (
                <span>
                  {i.label} <span className="sr-only">(done)</span>
                </span>
              ) : (
                <Link to={i.to}>{i.label}</Link>
              )}
              {i.done ? null : <span className="muted small"> {i.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          className="btn quiet small"
          onClick={() => {
            writeHidden(dismissKey, true);
            setHidden(true);
          }}
        >
          Hide this list
        </button>
      </div>
    </section>
  );
}
