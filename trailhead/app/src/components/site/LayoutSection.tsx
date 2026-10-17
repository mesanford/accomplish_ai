import { ANNOUNCEMENT_MAX, COVER_LAYOUTS, type EditDraft, type SiteDraft } from '../../lib/site';
import { Field } from '../ui';

/** The cover layout and an optional announcement banner on the home page. */
export function LayoutSection({ draft, onChange }: { draft: SiteDraft; onChange: EditDraft }) {
  const { announcement, coverLayout } = draft;
  return (
    <section className="card">
      <h2>Cover layout and announcement</h2>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ fontWeight: 600 }}>
          Cover layout
        </legend>
        {COVER_LAYOUTS.map(([id, label, hint]) => (
          <label key={id} className="check">
            <input type="radio" name="cover-layout" checked={coverLayout === id} onChange={() => onChange({ coverLayout: id })} />
            <span>
              <strong>{label}.</strong> {hint}
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Announcement" htmlFor="site-announcement" hint="A short banner at the top of the home page. Leave empty for none.">
        <input
          id="site-announcement"
          maxLength={ANNOUNCEMENT_MAX}
          value={announcement.text}
          placeholder="Camp fees are due October 30"
          onChange={(e) => onChange({ announcement: { ...announcement, text: e.target.value } })}
        />
      </Field>
      <Field label="Show until" htmlFor="site-announcement-end" hint="The banner stops showing after this date. Leave empty to keep it up.">
        <input
          id="site-announcement-end"
          type="date"
          value={announcement.endDate ?? ''}
          onChange={(e) => onChange({ announcement: { ...announcement, endDate: e.target.value || null } })}
        />
      </Field>
    </section>
  );
}
