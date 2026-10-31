import { useState } from 'react';
import { createOption } from '../../lib/plansOptions';
import { useTroop } from '../../lib/troop';
import { Empty } from '../ui';
import { BriefForm } from './BriefForm';
import { IdeaStarters } from './IdeaStarters';
import { OptionCard } from './OptionCard';
import { OptionForm } from './OptionForm';
import { PastTrips } from './PastTrips';
import type { PlanTabProps } from './planProps';
import { ResearchGuide } from './ResearchGuide';
import { TripQuestions } from './TripQuestions';
import { useAction } from './useAction';

/** Research cards: places and ideas to compare, with their availability. */
export function ResearchTab({ troopId, plan, options, canEdit }: PlanTabProps) {
  const { access } = useTroop();
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState(!plan.brief);
  const act = useAction();
  const memberId = access?.memberId ?? '';
  const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="stack" aria-label="Research">
      {canEdit && asking ? (
        <TripQuestions troopId={troopId} plan={plan} onDone={() => setAsking(false)} />
      ) : (
        <BriefForm troopId={troopId} plan={plan} canEdit={canEdit} onAsk={() => setAsking(true)} />
      )}
      {canEdit && plan.brief && !asking ? (
        <IdeaStarters troopId={troopId} plan={plan} options={options} memberId={memberId} />
      ) : null}
      <ResearchGuide kind={plan.kind} open={sorted.length === 0} />
      {canEdit ? <PastTrips troopId={troopId} plan={plan} options={options} memberId={memberId} /> : null}
      <h2>Options</h2>
      <p className="muted">Keep what you learn about each place here. Say when you last checked that it is available.</p>
      {sorted.length === 0 ? <Empty>No options yet. Add one below, or start from a place your troop has been.</Empty> : null}
      <ul className="stack">
        {sorted.map((o) => (
          <OptionCard key={o.id} troopId={troopId} plan={plan} memberId={memberId} option={o} canEdit={canEdit} />
        ))}
      </ul>
      {canEdit && adding ? (
        <div className="card">
          <h3>Add an option</h3>
          <OptionForm
            troopId={troopId}
            planId={plan.id}
            busy={act.busy}
            error={act.error}
            onCancel={() => setAdding(false)}
            onSave={async (values) => {
              if (await act.run(() => createOption(troopId, plan.id, memberId, values))) {
                setAdding(false);
              }
            }}
          />
        </div>
      ) : null}
      {canEdit && !adding ? (
        <div>
          <button className="btn" type="button" onClick={() => setAdding(true)}>
            Add an option
          </button>
        </div>
      ) : null}
    </section>
  );
}
