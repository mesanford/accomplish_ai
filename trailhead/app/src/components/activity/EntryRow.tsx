import { useState } from 'react';
import { type ActivityEntry, KIND_LABELS } from '../../lib/activity';
import { deleteActivityEntry, reviewActivityEntry } from '../../lib/activityApi';
import { errorMessage } from '../../lib/api';
import { ACTIVITY_TIP } from '../../lib/moreStatusTips';
import { plural } from '../../lib/plural';
import { TipPill } from '../TipPill';
import { formatDate, Notice } from '../ui';

const STATUS: Record<string, [string, string]> = {
  pending: ['Waiting for a leader', 'warn'],
  rejected: ['Not accepted', 'bad'],
};

/** The credit words: "2 nights · 3 service hours · 5 miles". */
export function amounts(e: ActivityEntry): string {
  return [
    e.nights ? plural(e.nights, 'night') : '',
    e.serviceHours ? plural(e.serviceHours, 'service hour') : '',
    e.miles ? plural(e.miles, 'mile') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function EntryRow({
  troopId,
  entry,
  leader,
  mine,
}: {
  troopId: string;
  entry: ActivityEntry;
  leader: boolean;
  /** The caller acts for this Scout (a parent, or the Scout), so they may withdraw an entry still waiting. */
  mine: boolean;
}) {
  const [error, setError] = useState('');
  const status = entry.status ?? 'approved';
  const manual = entry.source === 'manual';
  const canDelete = manual && (leader || (mine && status === 'pending'));

  async function run(task: () => Promise<unknown>) {
    setError('');
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const title = manual ? entry.note : (entry.eventTitle ?? 'Event');
  return (
    <li>
      <div className="stack" style={{ gap: 2 }}>
        <strong>{title}</strong>
        <span className="muted small">
          {formatDate(entry.date)} · {KIND_LABELS[entry.kind ?? 'other']}
          {entry.eagleProject ? ' · Eagle project' : ''}
          {amounts(entry) ? ` · ${amounts(entry)}` : ''}
          {manual && entry.enteredByName ? ` · added by ${entry.enteredByName}` : ''}
        </span>
        <Notice kind="error">{error}</Notice>
      </div>
      <div className="row">
        {STATUS[status] ? (
          <TipPill tone={STATUS[status][1]} tip={ACTIVITY_TIP[status as 'pending' | 'rejected']}>
            {STATUS[status][0]}
          </TipPill>
        ) : null}
        {leader && status === 'pending' ? (
          <>
            <button type="button" className="btn small" onClick={() => run(() => reviewActivityEntry(troopId, entry.id, 'approve'))}>
              Approve
            </button>
            <button type="button" className="btn secondary small" onClick={() => run(() => reviewActivityEntry(troopId, entry.id, 'reject'))}>
              Reject
            </button>
          </>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className="btn quiet small"
            aria-label={`Delete entry ${title ?? ''}`}
            onClick={() => run(() => deleteActivityEntry(troopId, entry.id))}
          >
            Delete
          </button>
        ) : null}
      </div>
    </li>
  );
}
