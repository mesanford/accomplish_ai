import { useId, type ReactNode } from 'react';

/**
 * A status pill with an explanation of what it means and why it matters. The explanation shows on hover, and on tap
 * or keyboard focus, since phones can't hover. Escape hides it. Screen readers read it as the pill's description.
 * The explanation sits next to the pill, not inside it, so the pill's own text stays exactly its label.
 */
export function TipPill({ tone, tip, children }: { tone?: string; tip: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="tip-wrap">
      <span
        className={`pill${tone ? ` ${tone}` : ''}`}
        tabIndex={0}
        aria-describedby={id}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.currentTarget.blur();
          }
        }}
      >
        {children}
      </span>
      <span role="tooltip" id={id} className="tip-pop">
        {tip}
      </span>
    </span>
  );
}
