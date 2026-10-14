import { CONSENT_LABELS, consentState, type GalleryItem, photoWillShow } from '../../lib/site';
import type { Member } from '../../lib/types';
import { Field } from '../ui';
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
  const shows = photoWillShow(item, scouts);
  const toggle = (id: string, on: boolean) =>
    onChange({ ...item, scoutIds: on ? [...item.scoutIds, id] : item.scoutIds.filter((s) => s !== id) });

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
          <label className="check">
            <input
              type="checkbox"
              checked={item.noScoutsShown}
              onChange={(e) => onChange({ ...item, noScoutsShown: e.target.checked })}
            />
            No Scouts can be identified in photo {n}
          </label>
          {item.noScoutsShown ? null : (
            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 600 }}>
                Scouts in photo {n}
              </legend>
              {scouts.map((s) => {
                const [label, tone] = CONSENT_LABELS[consentState(s)];
                return (
                  <div key={s.id} className="row">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={item.scoutIds.includes(s.id)}
                        onChange={(e) => toggle(s.id, e.target.checked)}
                      />
                      {s.displayName}
                    </label>
                    <span className={`pill ${tone}`}>{label}</span>
                  </div>
                );
              })}
            </fieldset>
          )}
          <p className={shows ? 'small' : 'small notice warn'}>
            {shows
              ? 'This photo will be published.'
              : 'This photo will be left out until every Scout in it has media consent, or you check that no Scouts can be identified.'}
          </p>
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
