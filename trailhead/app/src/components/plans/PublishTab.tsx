import { useState } from 'react';
import { Link } from 'react-router-dom';
import { describeField } from '../../lib/planForms';
import { FIELD_LABELS, type PlanField } from '../../lib/plans';
import { previewPublish, type PublishPreview, publishPlan, unlinkEvent } from '../../lib/plansApi';
import { Notice } from '../ui';
import { EventStateNotice } from './EventStateNotice';
import type { PlanTabProps } from './planProps';
import { PublishDiff } from './PublishDiff';
import { useAction } from './useAction';

/** Leaders put the plan on the calendar, or bring the event up to date, field by field. */
export function PublishTab({ troopId, plan }: PlanTabProps) {
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [venue, setVenue] = useState(false);
  const [publishedId, setPublishedId] = useState('');
  const act = useAction();
  const linked = Object.values(plan.eventIds ?? {})[0] ?? '';

  const toggle = (f: string) => setTicked((t) => (t.includes(f) ? t.filter((x) => x !== f) : [...t, f]));
  const venueBlocks = Boolean(preview?.venueProblem) && !venue;
  const nothingToDo = preview?.mode === 'update' && ticked.length === 0;

  async function load() {
    setPublishedId('');
    setTicked([]);
    setVenue(false);
    setPreview(await previewPublish(troopId, plan.id));
  }
  async function publish() {
    const out = await publishPlan(troopId, plan.id, ticked, venue);
    setPublishedId(out.eventId);
    setPreview(null);
  }
  const eventLink = publishedId || linked;

  return (
    <section className="stack" aria-label="Publish">
      <EventStateNotice plan={plan} />
      {eventLink ? (
        <p>
          <Link to={`/t/${troopId}/events/${eventLink}`}>Open the event</Link>
        </p>
      ) : null}
      <Notice kind="ok">{publishedId ? 'Published.' : ''}</Notice>
      <div className="row">
        <button className="btn" type="button" disabled={act.busy} onClick={() => act.run(load, '')}>
          Preview
        </button>
        {linked ? (
          <button className="btn secondary" type="button" disabled={act.busy} onClick={() => act.run(() => unlinkEvent(troopId, plan.id), 'Unlinked.')}>
            Unlink the event
          </button>
        ) : null}
      </div>
      {preview?.mode === 'create' ? (
        <div className="card stack">
          <h2>This will create an event</h2>
          <ul className="small">
            {Object.entries(preview.event).map(([k, v]) => (
              <li key={k}>
                {FIELD_LABELS[k as PlanField] ?? k}: {describeField(k as PlanField, v)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview?.mode === 'update' ? <PublishDiff rows={preview.diff} ticked={ticked} onToggle={toggle} /> : null}
      {preview?.venueProblem ? (
        <div className="stack">
          <Notice kind="warn">{preview.venueProblem}</Notice>
          <label className="check">
            <input type="checkbox" checked={venue} onChange={(e) => setVenue(e.target.checked)} />
            I confirmed with the venue
          </label>
        </div>
      ) : null}
      {preview ? (
        <div>
          <button className="btn" type="button" disabled={act.busy || venueBlocks || nothingToDo} onClick={() => act.run(publish, '')}>
            {preview.mode === 'create' ? 'Create the event' : 'Update the event'}
          </button>
          {nothingToDo ? <span className="muted small"> Tick at least one difference to update.</span> : null}
        </div>
      ) : null}
      <Notice kind="error">{act.error}</Notice>
    </section>
  );
}
