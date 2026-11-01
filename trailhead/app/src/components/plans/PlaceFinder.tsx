import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { findPlaces, mapsLinkFor, PLACE_KIND_LABELS, type PlaceRow } from '../../lib/placesApi';
import type { EventPlan, PlanOption } from '../../lib/plans';
import { createOption } from '../../lib/plansOptions';
import { Notice } from '../ui';
import { PlaceResult } from './PlaceResult';
import { useAction } from './useAction';

type Mode = 'nearby' | 'highAdventure';

function cardFor(p: PlaceRow) {
  const links = [p.url, p.bookingUrl].filter((l, i, all): l is string => Boolean(l) && all.indexOf(l) === i);
  return {
    name: p.name,
    type: PLACE_KIND_LABELS[p.kind],
    links: links.slice(0, 5),
    mapsUrl: mapsLinkFor(p),
    costCents: null,
    driveMinutes: typeof p.driveMinutes === 'number' ? p.driveMinutes : null,
    driveEstimated: typeof p.driveMinutes === 'number',
    capacity: null,
    amenities: [],
    bookingOpens: null,
    availability: { state: 'unknown' as const, note: '' },
    pros: '',
    cons: '',
    notes: p.description ? `${p.description} (Source: ${p.credit})` : `Source: ${p.credit}`,
  };
}

/** Places from the app's catalog: near the troop, or the high adventure bases. One click puts one on the plan. */
export function PlaceFinder({ troopId, plan, options, memberId }: { troopId: string; plan: EventPlan; options: PlanOption[]; memberId: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [rows, setRows] = useState<PlaceRow[]>([]);
  const [nearYou, setNearYou] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const act = useAction();
  const taken = new Set(options.map((o) => o.name.toLowerCase()));
  const big = plan.kind === 'highAdventure' || plan.brief?.tripLength === 'week';

  async function look(next: Mode) {
    setMode(next);
    setLoading(true);
    setError('');
    try {
      const found = await findPlaces(troopId, plan.id, next);
      setRows(found.places);
      setNearYou(found.nearYou);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const shown = rows.filter((r) => !taken.has(r.name.toLowerCase()));
  return (
    <section className="card stack" aria-label="Places to look at">
      <h2>Places to look at</h2>
      <p className="muted small">From public lists of campgrounds, state parks and high adventure bases, nearest first.</p>
      <div className="row">
        <button className="btn secondary small" type="button" aria-pressed={mode === 'nearby'} disabled={loading} onClick={() => look('nearby')}>
          Places near us
        </button>
        <button className="btn secondary small" type="button" aria-pressed={mode === 'highAdventure'} disabled={loading} onClick={() => look('highAdventure')}>
          {big ? 'High adventure bases (good for a week or more)' : 'High adventure bases'}
        </button>
      </div>
      {loading ? <p className="muted small">Looking…</p> : null}
      <Notice kind="error">{error || act.error}</Notice>
      <Notice kind="ok">{act.message}</Notice>
      {mode && !loading && !nearYou ? (
        <p className="muted small">Add the troop's meeting place on Troop settings to see what is closest.</p>
      ) : null}
      {mode && !loading && !error && shown.length === 0 ? <p className="muted small">Nothing to show yet.</p> : null}
      <ul className="stack">
        {shown.map((p) => (
          <PlaceResult
            key={p.id}
            place={p}
            busy={act.busy}
            onAdd={() => act.run(() => createOption(troopId, plan.id, memberId, cardFor(p)), `Added ${p.name}.`)}
          />
        ))}
      </ul>
    </section>
  );
}
