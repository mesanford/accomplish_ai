import { PHOTO_TIP } from '../../lib/moreStatusTips';
import { CONSENT_LABELS, consentState, tagsWillShow } from '../../lib/site';
import type { Member } from '../../lib/types';
import { TipPill } from '../TipPill';

export interface Tags {
  scoutIds: string[];
  noScoutsShown: boolean;
}

interface Props {
  /** How the image is named in labels, such as "photo 2", "the cover photo" or "the logo". */
  subject: string;
  tags: Tags;
  scouts: Member[];
  onChange: (tags: Tags) => void;
  /** What the image is, for the line under the tags: "photo", "cover photo" or "logo". */
  noun: string;
}

/** Which Scouts appear in an image (with each one's media consent), or confirmation that none can be identified. */
export function ScoutTags({ subject, tags, scouts, onChange, noun }: Props) {
  const shows = tagsWillShow(tags, scouts);
  const toggle = (id: string, on: boolean) =>
    onChange({ ...tags, scoutIds: on ? [...tags.scoutIds, id] : tags.scoutIds.filter((s) => s !== id) });

  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={tags.noScoutsShown}
          onChange={(e) => onChange({ ...tags, noScoutsShown: e.target.checked })}
        />
        No Scouts can be identified in {subject}
      </label>
      {tags.noScoutsShown ? null : (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 600 }}>
            Scouts in {subject}
          </legend>
          {scouts.map((s) => {
            const state = consentState(s);
            const [label, tone] = CONSENT_LABELS[state];
            return (
              <div key={s.id} className="row">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={tags.scoutIds.includes(s.id)}
                    onChange={(e) => toggle(s.id, e.target.checked)}
                  />
                  {s.displayName}
                </label>
                <TipPill tone={tone} tip={PHOTO_TIP[state]}>
                  {label}
                </TipPill>
              </div>
            );
          })}
        </fieldset>
      )}
      <p className={shows ? 'small' : 'small notice warn'}>
        {shows
          ? `This ${noun} will be published.`
          : `This ${noun} will be left out until every Scout in it has media consent, or you check that no Scouts can be identified.`}
      </p>
    </>
  );
}
