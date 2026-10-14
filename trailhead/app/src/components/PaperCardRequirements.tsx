import { normalizeReqId } from '../lib/requirements';
import { RequirementPicker } from './RequirementPicker';
import { Field } from './ui';

interface Props {
  awardId: string;
  reqIds: string[];
  /** A date for each requirement that differs from the shared date. */
  dates: Record<string, string>;
  sharedDate: string;
  max: string;
  onReqIds: (ids: string[]) => void;
  onDates: (dates: Record<string, string>) => void;
  onSharedDate: (date: string) => void;
}

/** Tick the requirements already signed on the paper card, with one date for all or a date for each. */
export function PaperCardRequirements({ awardId, reqIds, dates, sharedDate, max, onReqIds, onDates, onSharedDate }: Props) {
  return (
    <div className="stack">
      <Field label="Requirements already signed" htmlFor="pc-reqs" hint="Choose each requirement the counselor signed on the card.">
        <RequirementPicker key={awardId} awardId={awardId} multiple value={reqIds} onChange={onReqIds} inputId="pc-reqs" inputLabel="Requirements signed" />
      </Field>
      {reqIds.length > 0 ? (
        <div className="stack">
          <Field label="Date for all of them" htmlFor="pc-shared" hint="Used for any requirement below that has no date of its own.">
            <input id="pc-shared" type="date" max={max} value={sharedDate} onChange={(e) => onSharedDate(e.target.value)} style={{ width: 'auto' }} />
          </Field>
          <ul className="list">
            {reqIds.map((id) => (
              <li key={normalizeReqId(id) || id}>
                <span>Requirement {id}</span>
                <input
                  type="date"
                  max={max}
                  aria-label={`Date signed for requirement ${id}`}
                  value={dates[id] ?? ''}
                  onChange={(e) => onDates({ ...dates, [id]: e.target.value })}
                  style={{ width: 'auto' }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
