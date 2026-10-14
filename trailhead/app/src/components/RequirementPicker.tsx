import { useState } from 'react';
import { isSignable, normalizeReqId } from '../lib/requirements';
import { useRequirements } from '../lib/useRequirements';
import { OfficialLink } from './AwardRequirements';
import { type ReqStatus, RequirementList } from './RequirementList';

interface Props {
  awardId: string;
  /** Chosen requirement ids. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Pick several (checkboxes) instead of one. */
  multiple?: boolean;
  statuses?: Record<string, ReqStatus>;
  /** Fallback typed input: its id (single) and accessible name. */
  inputId?: string;
  inputLabel?: string;
  /** Hide the checklist behind a button (for long lists inside a form row). */
  collapsible?: boolean;
}

function TypedFallback({ awardId, value, onChange, multiple, inputId, inputLabel }: Props) {
  const [text, setText] = useState(value.join(', '));
  function change(next: string) {
    setText(next);
    onChange(multiple ? next.split(/[\s,;]+/).filter(Boolean) : [next.trim()]);
  }
  return (
    <div className="stack">
      <input
        id={inputId}
        aria-label={inputLabel ?? 'Requirement'}
        maxLength={multiple ? 200 : 12}
        placeholder={multiple ? 'Requirements done, e.g. 1, 2a, 4' : 'e.g. 4b'}
        value={text}
        onChange={(e) => change(e.target.value)}
        style={{ maxWidth: multiple ? 260 : 120 }}
      />
      <span className="small muted">
        The requirement text is not available here yet. <OfficialLink awardId={awardId} />
      </span>
    </div>
  );
}

/** Choose requirements from the official text. Falls back to typing a number when the text is missing. */
export function RequirementPicker(props: Props) {
  const { awardId, value, onChange, multiple, statuses, collapsible } = props;
  const { doc, loading } = useRequirements(awardId);
  const [open, setOpen] = useState(false);
  if (loading) {
    return <p className="small muted">Loading requirements…</p>;
  }
  if (!doc) {
    return <TypedFallback key={awardId} {...props} />;
  }
  const chosen = new Set(value.map(normalizeReqId));

  function toggle(id: string) {
    const key = normalizeReqId(id);
    if (!multiple) {
      onChange([id]);
    } else if (chosen.has(key)) {
      onChange(value.filter((v) => normalizeReqId(v) !== key));
    } else {
      onChange([...value, id]);
    }
  }

  const list = (
    <RequirementList
      doc={doc}
      statuses={statuses}
      selected={value}
      action={(r) => {
        if (!isSignable(r)) {
          return null;
        }
        return multiple ? (
          <input
            type="checkbox"
            aria-label={`Requirement ${r.id} done`}
            checked={chosen.has(normalizeReqId(r.id))}
            onChange={() => toggle(r.id)}
            style={{ width: 'auto' }}
          />
        ) : (
          <button
            type="button"
            className="btn quiet small"
            aria-pressed={chosen.has(normalizeReqId(r.id))}
            aria-label={`Choose requirement ${r.id}`}
            onClick={() => toggle(r.id)}
          >
            {chosen.has(normalizeReqId(r.id)) ? 'Chosen' : 'Choose'}
          </button>
        );
      }}
    />
  );
  if (!collapsible) {
    return list;
  }
  return (
    <div className="stack">
      <div>
        <button type="button" className="btn quiet small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide requirements' : `Choose requirements${value.length ? ` (${value.length} chosen)` : ''}`}
        </button>
        {value.length ? <span className="small muted"> {value.join(', ')}</span> : null}
      </div>
      {open ? list : null}
    </div>
  );
}
