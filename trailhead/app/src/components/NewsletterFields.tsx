import { Field, formatDate } from './ui';
import type { NewsletterSection } from '../lib/announcements';
import type { TroopEvent } from '../lib/types';

const MAX_SECTIONS = 6;
const MAX_EVENTS = 10;

interface Props {
  sections: NewsletterSection[];
  onSections: (next: NewsletterSection[]) => void;
  events: TroopEvent[];
  eventIds: string[];
  onEventIds: (next: string[]) => void;
}

/** The newsletter parts: a few headed sections and links to events. */
export function NewsletterFields({ sections, onSections, events, eventIds, onEventIds }: Props) {
  const change = (i: number, patch: Partial<NewsletterSection>) =>
    onSections(sections.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const toggle = (id: string) => onEventIds(eventIds.includes(id) ? eventIds.filter((x) => x !== id) : [...eventIds, id]);
  return (
    <>
      {sections.map((s, i) => (
        <fieldset key={i} className="card stack" style={{ margin: 0 }}>
          <legend className="small muted">Section {i + 1}</legend>
          <Field label="Heading" htmlFor={`nl-h-${i}`}>
            <input id={`nl-h-${i}`} value={s.heading} maxLength={80} onChange={(e) => change(i, { heading: e.target.value })} />
          </Field>
          <Field label="Text" htmlFor={`nl-t-${i}`}>
            <textarea id={`nl-t-${i}`} value={s.text} maxLength={2000} onChange={(e) => change(i, { text: e.target.value })} />
          </Field>
          <div>
            <button type="button" className="btn quiet small" onClick={() => onSections(sections.filter((_, n) => n !== i))}>
              Remove section {i + 1}
            </button>
          </div>
        </fieldset>
      ))}
      {sections.length < MAX_SECTIONS ? (
        <div>
          <button type="button" className="btn secondary small" onClick={() => onSections([...sections, { heading: '', text: '' }])}>
            Add a section
          </button>
        </div>
      ) : null}
      {events.length > 0 ? (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>Upcoming events to list</legend>
          <div className="stack" style={{ gap: 4 }}>
            {events.slice(0, 20).map((ev) => (
              <label key={ev.id} className="check">
                <input
                  type="checkbox"
                  checked={eventIds.includes(ev.id)}
                  disabled={!eventIds.includes(ev.id) && eventIds.length >= MAX_EVENTS}
                  onChange={() => toggle(ev.id)}
                />
                {ev.title}, {formatDate(ev.start)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
