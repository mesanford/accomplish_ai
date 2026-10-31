import { ideasFor } from '../../lib/ideaStarters';
import type { EventPlan, PlanOption } from '../../lib/plans';
import { createOption } from '../../lib/plansOptions';
import { Notice } from '../ui';
import { useAction } from './useAction';

/** Kinds of trips that fit the answers, each one click from the plan's list of ideas. */
export function IdeaStarters({
  troopId,
  plan,
  options,
  memberId,
}: {
  troopId: string;
  plan: EventPlan;
  options: PlanOption[];
  memberId: string;
}) {
  const act = useAction();
  const taken = new Set(options.map((o) => o.name.toLowerCase()));
  const ideas = ideasFor(plan.kind, plan.brief?.interests ?? [], plan.brief?.tripLength ?? null).filter(
    (i) => !taken.has(i.idea.toLowerCase()),
  );
  if (ideas.length === 0 && !act.message) {
    return null;
  }

  function add(idea: string, badges: string[]) {
    return act.run(
      () =>
        createOption(troopId, plan.id, memberId, {
          name: idea,
          type: 'Idea',
          links: [],
          mapsUrl: '',
          costCents: null,
          driveMinutes: null,
          driveEstimated: false,
          capacity: null,
          amenities: [],
          bookingOpens: null,
          availability: { state: 'unknown', note: '' },
          pros: badges.length ? `Can help with: ${badges.join(', ')} merit badges.` : '',
          cons: '',
          notes: 'An idea. Next: find a place to do it, and add the place as an option.',
        }),
      'Added to your ideas.',
    );
  }

  return (
    <section className="card stack" aria-label="Ideas to try">
      <h2>Ideas to try</h2>
      <p className="muted small">Picked from what you said you want to do. Add any that sound good, then find where.</p>
      {ideas.length === 0 ? <p className="small">You've added every idea that fits. Find places for them below.</p> : null}
      <ul className="list">
        {ideas.map((i) => (
          <li key={i.idea}>
            <span>
              <strong>{i.idea}</strong>
              {i.badges.length ? <span className="muted small"> · {i.badges.join(', ')}</span> : null}
            </span>
            <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => add(i.idea, i.badges)}>
              Add this idea
            </button>
          </li>
        ))}
      </ul>
      <Notice kind="ok">{act.message}</Notice>
      <Notice kind="error">{act.error}</Notice>
    </section>
  );
}
