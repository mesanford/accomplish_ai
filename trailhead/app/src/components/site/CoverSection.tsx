import type { EditDraft, SiteDraft } from '../../lib/site';
import { Field } from '../ui';
import { ColorPresets } from './ColorPresets';
import { ImageUpload } from './ImageUpload';
import { StoredImage } from './StoredImage';

interface Props {
  troopId: string;
  draft: SiteDraft;
  onChange: EditDraft;
}

/** Cover heading, tagline and photo, plus the theme color and logo. */
export function CoverSection({ troopId, draft, onChange }: Props) {
  const { cover, theme } = draft;
  return (
    <section className="card">
      <h2>Cover and look</h2>
      <Field label="Heading" htmlFor="site-heading" hint="The big title at the top of your site.">
        <input
          id="site-heading"
          maxLength={80}
          value={cover.heading}
          onChange={(e) => onChange({ cover: { ...cover, heading: e.target.value } })}
        />
      </Field>
      <Field label="Tagline" htmlFor="site-tagline" hint="One short line under the heading.">
        <input
          id="site-tagline"
          maxLength={160}
          value={cover.tagline}
          placeholder="Camping, service and leadership for youth 11 to 17"
          onChange={(e) => onChange({ cover: { ...cover, tagline: e.target.value } })}
        />
      </Field>
      <div className="row" style={{ alignItems: 'start' }}>
        <div className="stack">
          {cover.photoPath ? <StoredImage path={cover.photoPath} alt="Cover photo" /> : null}
          <ImageUpload
            troopId={troopId}
            kind="cover"
            label="Cover photo"
            hint="Use a photo where no Scout can be identified, such as a campsite or landscape."
            onUploaded={(path) => onChange((d) => ({ cover: { ...d.cover, photoPath: path } }))}
          />
          {cover.photoPath ? (
            <button type="button" className="btn quiet small" onClick={() => onChange({ cover: { ...cover, photoPath: null } })}>
              Remove cover photo
            </button>
          ) : null}
        </div>
        <div className="stack">
          {theme.logoPath ? <StoredImage path={theme.logoPath} alt="Troop logo" height={80} /> : null}
          <ImageUpload
            troopId={troopId}
            kind="logo"
            label="Logo"
            onUploaded={(path) => onChange((d) => ({ theme: { ...d.theme, logoPath: path } }))}
          />
          {theme.logoPath ? (
            <button type="button" className="btn quiet small" onClick={() => onChange({ theme: { ...theme, logoPath: null } })}>
              Remove logo
            </button>
          ) : null}
        </div>
      </div>
      <Field label="Theme color" htmlFor="site-color" hint="Used for headings and buttons on your site. Pick a suggestion or any color.">
        <div className="row">
          <input
            id="site-color"
            type="color"
            value={theme.color}
            style={{ width: 64, height: 40, padding: 2 }}
            onChange={(e) => onChange({ theme: { ...theme, color: e.target.value } })}
          />
          <ColorPresets value={theme.color} onPick={(color) => onChange({ theme: { ...theme, color } })} />
        </div>
      </Field>
    </section>
  );
}
