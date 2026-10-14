import { useEffect, useId, useRef, useState } from 'react';
import { HELP, type HelpKey } from '../lib/help';

/**
 * A small "?" button that opens a plain-language explanation. It opens on tap or click (not hover),
 * closes with Escape, an outside tap or the Close button, and returns focus to the "?".
 */
export function HelpTip({ topic, label }: { topic: HelpKey; label?: string }) {
  const entry = HELP[topic] as { title: string; body: string; learnMore?: string };
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    panel.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <span className="help-tip" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="help-btn"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Help: ${label ?? entry.title}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open ? (
        <div className="help-pop" id={id} role="region" aria-label={entry.title} tabIndex={-1} ref={panel}>
          <strong>{entry.title}</strong>
          <p>{entry.body}</p>
          <div className="row">
            {entry.learnMore ? (
              <a href={entry.learnMore} target="_blank" rel="noreferrer">
                Learn more on scouting.org
              </a>
            ) : null}
            <button type="button" className="btn quiet small" onClick={() => { setOpen(false); button.current?.focus(); }}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
