import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CustomAwardForm } from '../components/CustomAwardForm';
import { Empty, Loading, PageHeader } from '../components/ui';
import { useCustomAwards } from '../lib/customAwardsContext';
import { useTroop } from '../lib/troop';
import type { CustomAward } from '../lib/types';

function AwardList({ awards, troopId }: { awards: CustomAward[]; troopId: string }) {
  return (
    <ul className="list">
      {awards.map((a) => (
        <li key={a.id}>
          <div className="stack" style={{ gap: 2 }}>
            <Link to={`/t/${troopId}/awards/${a.id}`}>
              <strong>{a.name}</strong>
            </Link>
            {a.description ? <span className="muted small">{a.description}</span> : null}
          </div>
          <span className="pill neutral">Version {a.currentVersionId.replace(/^v/, '')}</span>
        </li>
      ))}
    </ul>
  );
}

/** Leaders list, create and open the troop's own awards. */
export function CustomAwards() {
  const { troopId, isLeader } = useTroop();
  const { awards, loading } = useCustomAwards();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  if (!isLeader) {
    return <Empty>Only leaders can manage troop awards.</Empty>;
  }
  const active = awards.filter((a) => !a.archived);
  const archived = awards.filter((a) => a.archived);

  return (
    <>
      <PageHeader eyebrow="Troop" title="Troop awards">
        {creating ? null : (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            New award
          </button>
        )}
      </PageHeader>
      <p className="muted">
        Make your own awards with your own requirements. You can change requirements at any time: each change makes a
        new version, and Scouts already working on the award keep theirs until you move them.
      </p>
      {creating ? (
        <section className="card">
          <h2>New award</h2>
          <CustomAwardForm troopId={troopId} onSaved={({ awardId }) => navigate(`/t/${troopId}/awards/${awardId}`)} />
          <div>
            <button type="button" className="btn quiet small" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      {loading ? <Loading /> : null}
      {!loading && active.length === 0 ? <Empty>No troop awards yet. Create one to get started.</Empty> : null}
      {active.length > 0 ? <AwardList awards={active} troopId={troopId} /> : null}
      {archived.length > 0 ? (
        <section className="stack">
          <h2>Archived</h2>
          <AwardList awards={archived} troopId={troopId} />
        </section>
      ) : null}
    </>
  );
}
