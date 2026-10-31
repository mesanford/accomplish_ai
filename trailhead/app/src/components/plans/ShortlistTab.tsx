import type { ReactNode } from 'react';
import { minutesText, money } from '../../lib/planForms';
import type { PlanOption } from '../../lib/plans';
import { Empty, formatDate } from '../ui';
import { AvailabilityAge } from './AvailabilityAge';
import type { PlanTabProps } from './planProps';
import { AvailabilityChip } from './StatusChip';

function opens(o: PlanOption): string {
  const b = o.bookingOpens;
  if (!b || (!b.date && !b.note)) {
    return 'Not set';
  }
  return `${b.date ? formatDate(b.date) : ''} ${b.note ?? ''}`.trim();
}

const COLUMNS: { label: string; cell: (o: PlanOption) => ReactNode }[] = [
  { label: 'Cost per Scout', cell: (o) => money(o.costCents) },
  { label: 'Drive time', cell: (o) => `${minutesText(o.driveMinutes)}${o.driveEstimated ? ' (estimate)' : ''}` },
  { label: 'Capacity', cell: (o) => o.capacity ?? 'Not set' },
  { label: 'Booking opens', cell: opens },
  {
    label: 'Availability',
    cell: (o) => (
      <span className="stack">
        <AvailabilityChip state={o.availability.state} />
        <AvailabilityAge option={o} />
      </span>
    ),
  },
  { label: 'Pros', cell: (o) => o.pros || '—' },
  { label: 'Cons', cell: (o) => o.cons || '—' },
];

/** Pinned options side by side. On a phone each option stacks as a card (see .compare in styles.css). */
export function ShortlistTab({ options }: PlanTabProps) {
  const pinned = options.filter((o) => o.pinned).sort((a, b) => a.name.localeCompare(b.name));
  if (pinned.length === 0) {
    return <Empty>Nothing on the shortlist yet. Add options to it from the Research tab.</Empty>;
  }
  return (
    <section className="table-box" aria-label="Shortlist">
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">Option</th>
            {COLUMNS.map((c) => (
              <th key={c.label} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pinned.map((o) => (
            <tr key={o.id}>
              <th scope="row">{o.name}</th>
              {COLUMNS.map((c) => (
                <td key={c.label} data-label={c.label}>
                  {c.cell(o)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
