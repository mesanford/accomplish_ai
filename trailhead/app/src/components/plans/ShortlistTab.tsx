import type { ReactNode } from 'react';
import { minutesText, money } from '../../lib/planForms';
import { briefProblems } from '../../lib/planBrief';
import type { EventPlan, PlanOption } from '../../lib/plans';
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

/** What doesn't fit the brief, in words with an icon, or that it fits. */
function fits(o: PlanOption, plan: EventPlan): ReactNode {
  if (!plan.brief) {
    return 'No brief yet';
  }
  const problems = briefProblems(o, plan.brief, (plan.headcount?.scouts ?? 0) + (plan.headcount?.adults ?? 0));
  if (problems.length === 0) {
    return (
      <span>
        <span aria-hidden="true">✓ </span>Fits
      </span>
    );
  }
  return (
    <ul className="small">
      {problems.map((p) => (
        <li key={p}>
          <span aria-hidden="true">⚠ </span>
          {p}
        </li>
      ))}
    </ul>
  );
}

const COLUMNS: { label: string; cell: (o: PlanOption, plan: EventPlan) => ReactNode }[] = [
  { label: 'Fits what you want', cell: fits },
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
export function ShortlistTab({ plan, options }: PlanTabProps) {
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
                  {c.cell(o, plan)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
