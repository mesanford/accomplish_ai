import { useState } from 'react';
import { isMapsLink } from '../../lib/driveTime';
import { minutesText, money } from '../../lib/planForms';
import { AVAILABILITY_LABELS, type Availability, type EventPlan, type PlanOption, safeLink } from '../../lib/plans';
import { deleteOption, setAvailability, setPinned, updateOption } from '../../lib/plansOptions';
import { formatDate, Notice } from '../ui';
import { AvailabilityAge } from './AvailabilityAge';
import { BriefFit } from './BriefFit';
import { Likes } from './Likes';
import { OptionForm } from './OptionForm';
import { AvailabilityChip } from './StatusChip';
import { useAction } from './useAction';

const STATES = Object.keys(AVAILABILITY_LABELS) as Availability[];

function Links({ links }: { links: string[] }) {
  const safe = links.map((l) => ({ raw: l, href: safeLink(l) })).filter((l) => l.href !== null);
  if (safe.length === 0) {
    return null;
  }
  return (
    <ul className="stack small">
      {safe.map((l) => (
        <li key={l.raw}>
          <a href={l.href as string} target="_blank" rel="noopener noreferrer">
            {l.raw}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One research card, with a quick availability change, pin, edit and delete. */
export function OptionCard({
  troopId,
  plan,
  memberId,
  option,
  canEdit,
  canShare,
}: {
  troopId: string;
  plan: EventPlan;
  memberId: string;
  option: PlanOption;
  /** Adults who edit the plan: may change any card. */
  canEdit: boolean;
  /** Everyone who shares in planning, Scouts included: may like cards and shortlist them. */
  canShare: boolean;
}) {
  const planId = plan.id;
  const mayChange = canEdit || (Boolean(memberId) && option.createdByMemberId === memberId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const act = useAction();
  const b = option.bookingOpens;

  if (editing) {
    return (
      <li className="card">
        <OptionForm
          troopId={troopId}
          planId={planId}
          option={option}
          busy={act.busy}
          error={act.error}
          onCancel={() => setEditing(false)}
          onSave={async (values) => {
            if (await act.run(() => updateOption(troopId, planId, memberId, option, values))) {
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }
  return (
    <li className="card stack">
      <div className="row spread">
        <h3>
          {option.pinned ? <span aria-hidden="true">★ </span> : null}
          {option.name}
          {option.pinned ? <span className="muted small"> (on the shortlist)</span> : null}
        </h3>
        <AvailabilityChip state={option.availability.state} />
      </div>
      <AvailabilityAge option={option} />
      {option.availability.note ? <p className="small">{option.availability.note}</p> : null}
      <ul className="stack small">
        {option.type ? <li>Kind: {option.type}</li> : null}
        <li>Cost per Scout: {money(option.costCents)}</li>
        <li>
          Drive: {minutesText(option.driveMinutes)}
          {option.driveEstimated ? ' (estimate)' : ''}
        </li>
        <li>Capacity: {option.capacity ?? 'Not set'}</li>
        {b?.date || b?.note ? (
          <li>
            Booking opens: {b.date ? formatDate(b.date) : ''} {b.note ?? ''}
          </li>
        ) : null}
      </ul>
      <BriefFit plan={plan} option={option} />
      {option.mapsUrl && isMapsLink(option.mapsUrl) ? (
        <p className="small">
          <a href={option.mapsUrl} target="_blank" rel="noopener noreferrer">
            Open in Google Maps
          </a>
        </p>
      ) : null}
      <Links links={option.links ?? []} />
      {option.pros ? <p className="small">Pros: {option.pros}</p> : null}
      {option.cons ? <p className="small">Cons: {option.cons}</p> : null}
      {option.notes ? <p className="small muted">{option.notes}</p> : null}
      <Likes troopId={troopId} planId={planId} option={option} memberId={memberId} canShare={canShare} />
      {canShare && !mayChange ? (
        <div className="row">
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => act.run(() => setPinned(troopId, planId, option.id, !option.pinned))}>
            {option.pinned ? 'Remove from shortlist' : 'Add to shortlist'}
          </button>
        </div>
      ) : null}
      {mayChange ? (
        <div className="row">
          <label className="small" htmlFor={`st-${option.id}`}>
            Availability
          </label>
          <select
            id={`st-${option.id}`}
            value={option.availability.state}
            disabled={act.busy}
            onChange={(e) => act.run(() => setAvailability(troopId, planId, memberId, option, e.target.value as Availability))}
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {AVAILABILITY_LABELS[s]}
              </option>
            ))}
          </select>
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => act.run(() => setPinned(troopId, planId, option.id, !option.pinned))}>
            {option.pinned ? 'Remove from shortlist' : 'Add to shortlist'}
          </button>
          <button className="btn secondary small" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn secondary small" type="button" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      ) : null}
      {confirming ? (
        <Notice kind="warn">
          <p>Delete {option.name}? This can not be undone.</p>
          <div className="row">
            <button className="btn small" type="button" disabled={act.busy} onClick={() => act.run(() => deleteOption(troopId, planId, option.id))}>
              Yes, delete it
            </button>
            <button className="btn secondary small" type="button" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </Notice>
      ) : null}
      <Notice kind="error">{act.error}</Notice>
    </li>
  );
}
