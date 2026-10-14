import { type ReactNode, useState } from 'react';
import { awardName } from '../lib/catalog';
import { type FlatRequirement, officialRequirementsUrl } from '../lib/requirements';
import { useRequirements } from '../lib/useRequirements';
import { type ReqStatus, RequirementList } from './RequirementList';

interface Props {
  awardId: string;
  statuses?: Record<string, ReqStatus>;
  action?: (req: FlatRequirement) => ReactNode;
  collapsedCount?: number;
}

export function OfficialLink({ awardId, children }: { awardId: string; children?: ReactNode }) {
  return (
    <a className="small" href={officialRequirementsUrl(awardId)} target="_blank" rel="noreferrer">
      {children ?? `Official ${awardName(awardId)} requirements`}
    </a>
  );
}

/** Loads an award's requirements and shows them, or a link to the official page when the text is missing. */
export function AwardRequirements({ awardId, statuses, action, collapsedCount }: Props) {
  const { doc, loading } = useRequirements(awardId);
  if (loading) {
    return <p className="small muted">Loading requirements…</p>;
  }
  if (!doc) {
    return (
      <p className="small muted">
        The requirement text is not available here yet. <OfficialLink awardId={awardId} />
      </p>
    );
  }
  return <RequirementList doc={doc} statuses={statuses} action={action} collapsedCount={collapsedCount} />;
}

/** A button that reveals an award's requirements on demand. */
export function RequirementsToggle(props: Props & { label?: string }) {
  const [open, setOpen] = useState(false);
  const label = props.label ?? 'requirements';
  return (
    <div className="stack">
      <div>
        <button type="button" className="btn quiet small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? `Hide ${label}` : `Show ${label}`}
        </button>
      </div>
      {open ? <AwardRequirements {...props} /> : null}
    </div>
  );
}
