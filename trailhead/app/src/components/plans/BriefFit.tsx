import { AMENITY_LABELS, briefProblems, toAsk } from '../../lib/planBrief';
import type { EventPlan, PlanOption } from '../../lib/plans';

/** How a research card fits the plan's brief: what it has, what doesn't fit (in words, with an icon) and what to
 * ask the place about. */
export function BriefFit({ plan, option }: { plan: EventPlan; option: PlanOption }) {
  const people = (plan.headcount?.scouts ?? 0) + (plan.headcount?.adults ?? 0);
  const problems = briefProblems(option, plan.brief, people);
  const ask = toAsk(option, plan.brief);
  const has = option.amenities ?? [];
  return (
    <div className="stack small">
      {has.length ? <p>Has: {has.map((a) => AMENITY_LABELS[a].toLowerCase()).join(', ')}</p> : null}
      {problems.length ? (
        <ul aria-label="Doesn't fit what you're looking for">
          {problems.map((p) => (
            <li key={p}>
              <span aria-hidden="true">⚠ </span>
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      {ask.length ? <p className="muted">Ask about: {ask.map((a) => AMENITY_LABELS[a].toLowerCase()).join(', ')}</p> : null}
    </div>
  );
}
