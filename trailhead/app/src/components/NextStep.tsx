import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** An empty state that says what to do next, with a button or link to do it. */
export function NextStep({
  children,
  action,
  to,
  onClick,
}: {
  children: ReactNode;
  action?: string;
  to?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty next-step">
      <p>{children}</p>
      {action && to ? (
        <Link className="btn" to={to}>
          {action}
        </Link>
      ) : null}
      {action && onClick ? (
        <button type="button" className="btn" onClick={onClick}>
          {action}
        </button>
      ) : null}
    </div>
  );
}
