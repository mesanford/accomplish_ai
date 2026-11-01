import { type EventPlan, FIELD_LABELS } from '../../lib/plans';
import { Notice } from '../ui';

const DRIFT_TEXT: Record<string, string> = {
  place: "The event's place was changed on the event page.",
  start: "The event's first day was changed on the event page.",
  title: "The event's name was changed on the event page.",
};

/** What reconcile found about the published event: changed on its page, cancelled or deleted. */
export function EventStateNotice({ plan }: { plan: EventPlan }) {
  const states = Object.values(plan.eventState ?? {});
  return (
    <>
      {states.map((s, i) => (
        <div className="stack" key={i}>
          {s.state === 'deleted' ? <Notice kind="error">The event was deleted. Unlink it to publish again.</Notice> : null}
          {s.state === 'cancelled' ? <Notice kind="warn">The event was cancelled.</Notice> : null}
          {s.state === 'live' && s.drift.length > 0 ? (
            <Notice kind="info">
              <ul>
                {s.drift.map((f) => (
                  <li key={f}>{DRIFT_TEXT[f] ?? `${FIELD_LABELS[f]} was changed on the event page.`}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ))}
    </>
  );
}
