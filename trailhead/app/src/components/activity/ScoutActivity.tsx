import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  type ActivityEntry,
  CAMPING_BADGE_NIGHTS,
  campingBadgeNights,
  eagleProjectHours,
  serviceSteps,
  sumEntries,
} from '../../lib/activity';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { plural } from '../../lib/plural';
import { useTroop } from '../../lib/troop';
import { EntryRow } from './EntryRow';
import { ManualEntryForm } from './ManualEntryForm';

const byDateDesc = (a: ActivityEntry, b: ActivityEntry) => (b.date ?? '').localeCompare(a.date ?? '');

/** A Scout's camping nights, service hours and miles, with the totals the requirements ask for. Shown to leaders and
 * the Scout's family. Totals count only approved credits. */
export function ScoutActivity({ scoutId, rankDates }: { scoutId: string; rankDates?: Record<string, string> }) {
  const { troopId, isLeader, actingScoutIds } = useTroop();
  const q = useMemo(() => query(collection(db, `troops/${troopId}/logs`), where('scoutId', '==', scoutId)), [troopId, scoutId]);
  const logs = useQuery<ActivityEntry>(q, `${troopId}/logs/${scoutId}`);
  const entries = [...logs.data].sort(byDateDesc);
  const totals = sumEntries(entries);
  const camping = campingBadgeNights(entries);
  const eagle = eagleProjectHours(entries);
  const mine = actingScoutIds.includes(scoutId);
  const pending = entries.filter((e) => e.status === 'pending').length;

  return (
    <section className="stack" aria-label="Activity">
      <h2>Camping, service and hiking</h2>
      <p className="small" data-testid="activity-totals">
        <strong>{plural(totals.nights, 'night')}</strong> camped in {plural(totals.campouts, 'campout')} ·{' '}
        <strong>{plural(totals.serviceHours, 'service hour')}</strong> · <strong>{plural(totals.miles, 'mile')}</strong> hiked
      </p>
      {pending > 0 ? <p className="muted small">{plural(pending, 'entry', 'entries')} waiting for a leader. They do not count yet.</p> : null}
      <div className="card stack">
        <h3>Toward requirements</h3>
        <ul className="stack small">
          <li>
            Camping merit badge: {camping.counted} of {CAMPING_BADGE_NIGHTS} nights count.
            {camping.notCounted > 0
              ? ` ${plural(camping.notCounted, 'night')} of long-term camps do not count, because only one long-term camp, up to 6 nights, counts.`
              : ''}
          </li>
          <li>
            Overnight campouts: {totals.campouts}. Tenderfoot needs 1, Second Class 2 and First Class 3.
          </li>
          {serviceSteps(entries, rankDates).map((s) => (
            <li key={s.label}>
              {s.label}: {s.have} of {plural(s.needed, 'service hour')}
              {s.after ? ` (${s.after})` : ''}
              {s.have >= s.needed ? ' - enough' : ''}
            </li>
          ))}
          {eagle > 0 ? <li>Eagle service project: {plural(eagle, 'hour')} recorded.</li> : null}
        </ul>
        <p className="muted small">
          These totals help you plan. A leader or counselor still signs off each requirement.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="muted">Nothing yet. Nights, hours and miles show up here when a Scout is marked present at a campout, service project or hike.</p>
      ) : (
        <ul className="list">
          {entries.map((e) => (
            <EntryRow key={e.id} troopId={troopId} entry={e} leader={isLeader} mine={mine} />
          ))}
        </ul>
      )}
      {isLeader || mine ? (
        <details className="card">
          <summary>Add an entry</summary>
          <ManualEntryForm troopId={troopId} scoutId={scoutId} leader={isLeader} />
        </details>
      ) : null}
    </section>
  );
}
