import type { EditDraft, SiteDraft } from '../../lib/site';
import { useTroop } from '../../lib/troop';
import { Field } from '../ui';
import { ColorPresets } from './ColorPresets';
import { ImageUpload } from './ImageUpload';
import { ScoutTags } from './ScoutTags';
import { StoredImage } from './StoredImage';

interface Props {
  troopId: string;
  draft: SiteDraft;
  onChange: EditDraft;
}

/** Cover heading, tagline and photo, plus the theme color and logo. The cover photo and logo follow the same Scout
 * tagging and media-consent rule as gallery photos. */
export function CoverSection({ troopId, draft, onChange }: Props) {
  const { members } = useTroop();
  const scouts = members.filter((m) => m.kind === 'scout');
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
            onUploaded={(path) =>
              onChange((d) => ({ cover: { ...d.cover, photoPath: path, photoScoutIds: [], photoNoScoutsShown: false } }))
            }
          />
          {cover.photoPath ? (
            <>
              <ScoutTags
                subject="the cover photo"
                noun="cover photo"
                tags={{ scoutIds: cover.photoScoutIds, noScoutsShown: cover.photoNoScoutsShown }}
                scouts={scouts}
                onChange={(t) => onChange({ cover: { ...cover, photoScoutIds: t.scoutIds, photoNoScoutsShown: t.noScoutsShown } })}
              />
              <button
                type="button"
                className="btn quiet small"
                onClick={() => onChange({ cover: { ...cover, photoPath: null, photoScoutIds: [], photoNoScoutsShown: false } })}
              >
                Remove cover photo
              </button>
            </>
          ) : null}
        </div>
        <div className="stack">
          {theme.logoPath ? <StoredImage path={theme.logoPath} alt="Troop logo" height={80} /> : null}
          <ImageUpload
            troopId={troopId}
            kind="logo"
            label="Logo"
            hint="A troop emblem or logo. If it shows a Scout, the same media-consent rule applies."
            onUploaded={(path) =>
              onChange((d) => ({ theme: { ...d.theme, logoPath: path, logoScoutIds: [], logoNoScoutsShown: false } }))
            }
          />
          {theme.logoPath ? (
            <>
              <ScoutTags
                subject="the logo"
                noun="logo"
                tags={{ scoutIds: theme.logoScoutIds, noScoutsShown: theme.logoNoScoutsShown }}
                scouts={scouts}
                onChange={(t) => onChange({ theme: { ...theme, logoScoutIds: t.scoutIds, logoNoScoutsShown: t.noScoutsShown } })}
              />
              <button
                type="button"
                className="btn quiet small"
                onClick={() => onChange({ theme: { ...theme, logoPath: null, logoScoutIds: [], logoNoScoutsShown: false } })}
              >
                Remove logo
              </button>
            </>
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
