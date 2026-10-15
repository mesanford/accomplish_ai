import type { GalleryItem } from '../../lib/site';
import type { Member } from '../../lib/types';
import { Field } from '../ui';
import { ScoutTags } from './ScoutTags';
import { StoredImage } from './StoredImage';

interface Props {
  item: GalleryItem;
  index: number;
  scouts: Member[];
  onChange: (item: GalleryItem) => void;
  onRemove: () => void;
}

/** One gallery photo: caption, which Scouts appear in it (with each one's consent), and whether it will publish. */
export function GalleryRow({ item, index, scouts, onChange, onRemove }: Props) {
  const n = index + 1;
  return (
    <div className="card" style={{ background: 'transparent' }}>
      <div className="row" style={{ alignItems: 'start' }}>
        <StoredImage path={item.path} alt={item.caption || `Photo ${n}`} />
        <div className="stack" style={{ flex: '1 1 260px' }}>
          <Field label={`Photo ${n} caption`} htmlFor={`photo-caption-${index}`}>
            <input
              id={`photo-caption-${index}`}
              maxLength={200}
              value={item.caption}
              onChange={(e) => onChange({ ...item, caption: e.target.value })}
            />
          </Field>
          <ScoutTags
            subject={`photo ${n}`}
            noun="photo"
            tags={item}
            scouts={scouts}
            onChange={(tags) => onChange({ ...item, ...tags })}
          />
          <div>
            <button type="button" className="btn quiet small" onClick={onRemove}>
              Remove photo {n}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
