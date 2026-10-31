import { useState } from 'react';
import { type Milestone, isOverdue, sortMilestones } from '../../lib/plans';
import { completeMilestone, deleteMilestone, upsertMilestone } from '../../lib/plansApi';
import { Empty, formatDate, Notice, todayIso } from '../ui';
import { MilestoneForm, OWNER_LABELS } from './MilestoneForm';
import type { PlanTabProps } from './planProps';
import { useAction } from './useAction';

function MilestoneRow({ troopId, planId, m, canEdit, canShare }: { troopId: string; planId: string; m: Milestone; canEdit: boolean; canShare: boolean }) {
  const [editing, setEditing] = useState(false);
  const act = useAction();
  const late = isOverdue(m, todayIso());
  if (editing) {
    return (
      <li className="card">
        <MilestoneForm
          milestone={m}
          nextOrder={m.order}
          busy={act.busy}
          error={act.error}
          onCancel={() => setEditing(false)}
          onSave={async (values) => {
            if (await act.run(() => upsertMilestone(troopId, planId, values, m.id))) {
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }
  return (
    <li>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(m.done)}
          disabled={!canShare || act.busy}
          onChange={(e) => act.run(() => completeMilestone(troopId, planId, m.id, e.target.checked))}
        />
        <span>
          {m.title}
          <span className="muted small">
            {' · '}
            {m.dueOn ? `Due ${formatDate(m.dueOn)}` : 'Due once the first day is set'}
            {m.ownerRole ? ` · ${OWNER_LABELS[m.ownerRole]}` : ''}
          </span>
        </span>
      </label>
      {late ? (
        <span className="pill bad">
          <span aria-hidden="true">! </span>Overdue
        </span>
      ) : null}
      {m.done ? <span className="pill good"><span aria-hidden="true">✓ </span>Done</span> : null}
      {canEdit ? (
        <span className="row">
          <button className="btn secondary small" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => act.run(() => deleteMilestone(troopId, planId, m.id))}>
            Delete
          </button>
        </span>
      ) : null}
      <Notice kind="error">{act.error}</Notice>
    </li>
  );
}

/** The plan's to-do list, in date order. */
export function MilestonesPanel({ troopId, plan, milestones, canEdit, canShare }: PlanTabProps) {
  const [adding, setAdding] = useState(false);
  const act = useAction();
  const sorted = sortMilestones(milestones);
  const nextOrder = milestones.reduce((max, m) => Math.max(max, m.order + 1), 0);
  return (
    <section className="stack" aria-label="Milestones">
      <h2>Milestones</h2>
      {sorted.length === 0 ? <Empty>No milestones yet.</Empty> : null}
      <ul className="list">
        {sorted.map((m) => (
          <MilestoneRow key={m.id} troopId={troopId} planId={plan.id} m={m} canEdit={canEdit} canShare={canShare} />
        ))}
      </ul>
      {canEdit && adding ? (
        <div className="card">
          <MilestoneForm
            nextOrder={nextOrder}
            busy={act.busy}
            error={act.error}
            onCancel={() => setAdding(false)}
            onSave={async (values) => {
              if (await act.run(() => upsertMilestone(troopId, plan.id, values))) {
                setAdding(false);
              }
            }}
          />
        </div>
      ) : null}
      {canEdit && !adding ? (
        <div>
          <button className="btn secondary" type="button" onClick={() => setAdding(true)}>
            Add a milestone
          </button>
        </div>
      ) : null}
    </section>
  );
}
