import { type ReactNode, useState } from 'react';
import { type FlatRequirement, flatten, normalizeReqId, REQUIREMENTS_ATTRIBUTION, type RequirementsDoc } from '../lib/requirements';

export type ReqStatus = 'signed' | 'ready' | 'review';

const STATUS_PILL: Record<ReqStatus, { cls: string; text: string }> = {
  signed: { cls: 'good', text: 'Signed' },
  ready: { cls: 'warn', text: 'Ready for sign-off' },
  review: { cls: 'bad', text: 'Needs review' },
};

interface Props {
  doc: RequirementsDoc;
  /** Status by normalized requirement id (see statusLookup). */
  statuses?: Record<string, ReqStatus>;
  /** Extra control beside each requirement, such as a Sign button. */
  action?: (req: FlatRequirement) => ReactNode;
  /** Ids (any spelling) to highlight as chosen. */
  selected?: string[];
  /** Long lists show this many rows until expanded. */
  collapsedCount?: number;
  hideAttribution?: boolean;
}

export function RequirementResources({ req }: { req: FlatRequirement }) {
  if (!req.resources?.length) {
    return null;
  }
  return (
    <ul className="req-resources">
      {req.resources.map((r) => (
        <li key={r.url}>
          <a href={r.url} target="_blank" rel="noreferrer">
            {r.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Attribution({ doc }: { doc: RequirementsDoc }) {
  return (
    <p className="req-credit small muted">
      {REQUIREMENTS_ATTRIBUTION}{' '}
      <a href={doc.sourceUrl} target="_blank" rel="noreferrer">
        Source on scouting.org
      </a>
      {doc.fetchedAt ? ` · retrieved ${doc.fetchedAt}` : ''}
      {doc.note ? ` · ${doc.note}` : ''}
    </p>
  );
}

/** The official requirements as an indented checklist, with optional status and actions. */
export function RequirementList({ doc, statuses, action, selected, collapsedCount = 14, hideAttribution }: Props) {
  const [expanded, setExpanded] = useState(false);
  const all = flatten(doc.requirements);
  const long = all.length > collapsedCount;
  const shown = long && !expanded ? all.slice(0, collapsedCount) : all;
  const chosen = new Set((selected ?? []).map(normalizeReqId));
  return (
    <div className="req-list">
      <ol className="req-items" aria-label={`${doc.name} requirements`}>
        {shown.map((r) => {
          const status = statuses?.[normalizeReqId(r.id)];
          const picked = chosen.has(normalizeReqId(r.id));
          return (
            <li key={r.id} className={`req${picked ? ' chosen' : ''}`} style={{ paddingLeft: 10 + Math.min(r.depth, 3) * 18 }}>
              <span className="req-label">{r.label}</span>
              <div className="req-body">
                <span>{r.text}</span>
                <RequirementResources req={r} />
              </div>
              <div className="req-side">
                {status ? <span className={`pill ${STATUS_PILL[status].cls}`}>{STATUS_PILL[status].text}</span> : null}
                {action ? action(r) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {long ? (
        <button type="button" className="btn quiet small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer requirements' : `Show all ${all.length} requirements`}
        </button>
      ) : null}
      {hideAttribution ? null : <Attribution doc={doc} />}
    </div>
  );
}
