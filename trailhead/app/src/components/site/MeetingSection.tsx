import type { EditDraft, SiteDraft } from '../../lib/site';
import { Field } from '../ui';

/** When and where the troop meets, and whether it is welcoming new Scouts. */
export function MeetingSection({ draft, onChange }: { draft: SiteDraft; onChange: EditDraft }) {
  const { meeting, recruiting } = draft;
  return (
    <section className="card">
      <h2>Meetings and joining</h2>
      <Field label="When you meet" htmlFor="site-schedule">
        <input
          id="site-schedule"
          maxLength={120}
          value={meeting.schedule}
          placeholder="Mondays, 7:00–8:30 pm"
          onChange={(e) => onChange({ meeting: { ...meeting, schedule: e.target.value } })}
        />
      </Field>
      <Field label="Where you meet" htmlFor="site-place">
        <input
          id="site-place"
          maxLength={120}
          value={meeting.place}
          placeholder="St. Mark's Church, fellowship hall"
          onChange={(e) => onChange({ meeting: { ...meeting, place: e.target.value } })}
        />
      </Field>
      <Field label="Street address (optional)" htmlFor="site-address" hint="Adds a map link to your site.">
        <input
          id="site-address"
          maxLength={200}
          value={meeting.address ?? ''}
          onChange={(e) => onChange({ meeting: { ...meeting, address: e.target.value || null } })}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={recruiting.open}
          onChange={(e) => onChange({ recruiting: { ...recruiting, open: e.target.checked } })}
        />
        We're welcoming new Scouts (shows a "Join us" form)
      </label>
      {recruiting.open ? (
        <Field label="Message for new families" htmlFor="site-intro">
          <textarea
            id="site-intro"
            maxLength={1000}
            value={recruiting.intro}
            placeholder="Visit a meeting any Monday. Tell us a little about your family and we'll be in touch."
            onChange={(e) => onChange({ recruiting: { ...recruiting, intro: e.target.value } })}
          />
        </Field>
      ) : null}
    </section>
  );
}
