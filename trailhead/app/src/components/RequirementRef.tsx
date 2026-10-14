import { type KeyboardEvent, useId, useState } from 'react';
import { findRequirement, isCustomAwardId, officialRequirementsUrl } from '../lib/requirements';
import { useRequirements } from '../lib/useRequirements';
import { RequirementResources } from './RequirementList';

interface Props {
  awardId: string;
  reqId: string;
}

/** A requirement number that opens that requirement's text when clicked. */
export function RequirementRef({ awardId, reqId }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { doc, loading } = useRequirements(awardId, open);
  if (isCustomAwardId(awardId)) {
    return <>{reqId}</>;
  }
  const req = findRequirement(doc, reqId);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <span className="req-ref" onKeyDown={onKeyDown}>
      <button type="button" className="req-ref-btn" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(!open)}>
        {reqId}
      </button>
      {open ? (
        <span id={panelId} role="note" className="req-pop">
          {loading ? 'Loading requirement…' : null}
          {req ? (
            <>
              <strong>{req.label}</strong> {req.text}
              <RequirementResources req={req} />
            </>
          ) : null}
          {!loading && !req ? <>The text of requirement {reqId} is not available here. </> : null}
          {!loading ? (
            <a href={doc?.sourceUrl ?? officialRequirementsUrl(awardId)} target="_blank" rel="noreferrer">
              Official requirements
            </a>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Several requirement numbers in a row, separated by commas. */
export function RequirementRefs({ awardId, reqIds }: { awardId: string; reqIds: string[] }) {
  return (
    <>
      {reqIds.map((id, i) => (
        <span key={id}>
          {i > 0 ? ', ' : ''}
          <RequirementRef awardId={awardId} reqId={id} />
        </span>
      ))}
    </>
  );
}
