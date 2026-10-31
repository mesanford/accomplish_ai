import type { Status } from '../../lib/yearView';

export const STATUS_TEXT: Record<Status, string> = { booked: 'Booked', maybe: 'Maybe', open: 'Open' };
const ICON: Record<Status, string> = { booked: '●', maybe: '◐', open: '○' };

/** An icon and a word, so status never depends on colour. */
export function StatusMark({ status }: { status: Status }) {
  return (
    <span className={`cal-mark ${status}`}>
      <span aria-hidden="true">{ICON[status]}</span> {STATUS_TEXT[status]}
    </span>
  );
}

export function Legend() {
  return (
    <ul className="cal-legend small" aria-label="Legend">
      <li>
        <StatusMark status="booked" /> an event is on the calendar
      </li>
      <li>
        <StatusMark status="maybe" /> a trip plan is being considered
      </li>
      <li>
        <StatusMark status="open" /> a weekend with nothing planned
      </li>
    </ul>
  );
}

export function iconOf(status: Status): string {
  return ICON[status];
}
