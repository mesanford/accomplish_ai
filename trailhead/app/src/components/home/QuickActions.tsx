import { Link } from 'react-router-dom';
import { homeActions } from '../../lib/homeActions';
import { useTroop } from '../../lib/troop';

/** "What do you want to do?": the jumping-off points for what this person can do in the troop. */
export function QuickActions() {
  const { troopId, isLeader, has, access } = useTroop();
  const actions = homeActions({
    isLeader,
    canPost: has('leader', 'scoutmaster', 'advancement', 'committee'),
    counselor: has('counselor'),
    parent: has('parent') && (access?.scoutIds ?? []).length > 0,
    accounts: has('treasurer', 'scoutmaster', 'advancement'),
  });
  return (
    <section className="stack" aria-label="What do you want to do?">
      <h2 className="blazed">What do you want to do?</h2>
      <div className="grid">
        {actions.map((a) =>
          a.to.startsWith('#') ? (
            <button
              key={a.key}
              type="button"
              className="card link"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => document.getElementById(a.to.slice(1))?.scrollIntoView({ behavior: 'smooth' })}
            >
              <h3>{a.label}</h3>
              <span className="muted small">{a.hint}</span>
            </button>
          ) : (
            <Link key={a.key} className="card link" to={`/t/${troopId}/${a.to}`}>
              <h3>{a.label}</h3>
              <span className="muted small">{a.hint}</span>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
