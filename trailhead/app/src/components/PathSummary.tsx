import { Link } from 'react-router-dom';
import { awardName } from '../lib/catalog';
import { plural } from '../lib/plural';
import { uniqueIssues } from '../lib/feasibility';
import type { Feasibility, PathDoc } from '../lib/types';
import { HelpTip } from './HelpTip';
import { formatDate, PathStatusPill } from './ui';

/**
 * `hideCodes` leaves out issues shown elsewhere on the same page, such as the plan check under a draft.
 * The same message is never listed twice.
 */
export function FeasibilityView({ result, hideCodes = [] }: { result: Feasibility; hideCodes?: string[] }) {
  const issues = uniqueIssues(result.issues.filter((i) => !hideCodes.includes(i.code)));
  return (
    <div className="stack">
      <div className="row">
        <PathStatusPill status={result.status} />
        <HelpTip topic="pathFeasibility" label="what this status means" />
        {result.earliest_goal_date ? (
          <span>
            Earliest possible date: <strong>{formatDate(result.earliest_goal_date)}</strong>
          </span>
        ) : null}
      </div>
      {issues.length > 0 ? (
        <ul className="issues">
          {[...issues].sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error')).map((i, n) => (
            <li key={`${i.code}-${n}`} className={i.severity}>
              {i.message}
            </li>
          ))}
        </ul>
      ) : null}
      {(result.next_steps ?? []).length > 0 ? (
        <div className="stack">
          <h3>Next steps</h3>
          <ul>
            {(result.next_steps ?? []).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PathSummary({ path, editTo }: { path: PathDoc | null; editTo: string }) {
  if (!path) {
    return (
      <div className="card">
        <h2>Path</h2>
        <p className="muted">No plan yet. A plan picks a goal rank and the badges to earn on the way.</p>
        <div>
          <Link className="btn" to={editTo}>
            Plan a path
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="row spread">
        <h2>Path to {awardName(path.goalAwardId)}</h2>
        <Link className="btn secondary small" to={editTo}>
          Edit plan
        </Link>
      </div>
      <p className="muted small">
        {plural(path.items.length, 'badge')} planned{path.targetDate ? ` · target ${formatDate(path.targetDate)}` : ''}
      </p>
      {path.feasibility ? <FeasibilityView result={path.feasibility} /> : <p className="muted">Checking the plan…</p>}
    </div>
  );
}
