import { useState } from 'react';
import { ADVISORY, type CheckResult } from '../../lib/plans';
import { checkIntent } from '../../lib/plansApi';
import { Empty, Notice } from '../ui';
import { CheckCard } from './CheckCard';
import type { PlanTabProps } from './planProps';
import { useAction } from './useAction';

/** Readiness checks against the rules, with "Check again" and, for leaders, acknowledgements. */
export function ReadyTab({ troopId, plan, canEdit, isLeader }: PlanTabProps) {
  const [fresh, setFresh] = useState<CheckResult[] | null>(null);
  const act = useAction();
  const results = fresh ?? plan.intentReadiness?.results ?? [];
  return (
    <section className="stack" aria-label="Ready">
      <Notice kind="warn">{ADVISORY}</Notice>
      {canEdit ? (
        <div>
          <button className="btn" type="button" disabled={act.busy} onClick={() => act.run(async () => setFresh((await checkIntent(troopId, plan.id)).results), 'Checked.')}>
            Check again
          </button>
        </div>
      ) : null}
      <Notice kind="error">{act.error}</Notice>
      <Notice kind="ok">{act.message}</Notice>
      {results.length === 0 ? <Empty>Nothing has been checked yet. Press Check again.</Empty> : null}
      <ul className="stack">
        {results.map((c) => (
          <CheckCard key={c.id} troopId={troopId} planId={plan.id} check={c} isLeader={isLeader} onResults={setFresh} />
        ))}
      </ul>
    </section>
  );
}
