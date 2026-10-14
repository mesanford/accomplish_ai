import { type EditDraft, LIMITS, type SiteDraft } from '../../lib/site';
import { useTroop } from '../../lib/troop';
import { Empty } from '../ui';
import { GalleryRow } from './GalleryRow';
import { ImageUpload } from './ImageUpload';

interface Props {
  troopId: string;
  draft: SiteDraft;
  onChange: EditDraft;
}

/** Photos for the public site. Photos showing Scouts publish only with media consent for every Scout tagged. */
export function GallerySection({ troopId, draft, onChange }: Props) {
  const { members } = useTroop();
  const scouts = members.filter((m) => m.kind === 'scout');
  const { gallery } = draft;

  return (
    <section className="card">
      <h2>Photos</h2>
      <p className="muted small">
        Tag every Scout who appears in a photo. A photo goes on the site only if each tagged Scout's parent has given
        media consent, or if no Scout can be identified in it. Scouts' names are never shown on the site.
      </p>
      {gallery.length === 0 ? <Empty>No photos yet.</Empty> : null}
      {gallery.map((item, i) => (
        <GalleryRow
          key={item.path}
          item={item}
          index={i}
          scouts={scouts}
          onChange={(next) => onChange({ gallery: gallery.map((g, n) => (n === i ? next : g)) })}
          onRemove={() => onChange({ gallery: gallery.filter((_, n) => n !== i) })}
        />
      ))}
      {gallery.length < LIMITS.gallery ? (
        <ImageUpload
          troopId={troopId}
          kind="photo"
          label="Add a photo"
          hint="PNG, JPEG, GIF or WebP, up to 8 MB."
          onUploaded={(path) =>
            onChange((d) => ({ gallery: [...d.gallery, { path, caption: '', scoutIds: [], noScoutsShown: false }] }))
          }
        />
      ) : (
        <p className="muted small">Your site can have up to {LIMITS.gallery} photos.</p>
      )}
    </section>
  );
}
