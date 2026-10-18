import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CustomAwardForm } from '../components/CustomAwardForm';
import { GuideBlock } from '../components/GuideBlock';
import { NextStep } from '../components/NextStep';
import { Loading, PageHeader } from '../components/ui';
import { useCustomAwards } from '../lib/customAwardsContext';
import { useTroop } from '../lib/troop';
import type { CustomAward } from '../lib/types';
import { NoAccess } from '../components/NoAccess';
import { HelpTip } from '../components/HelpTip';
import { TipPill } from '../components/TipPill';
import { ARCHIVED_AWARD_TIP } from '../lib/archiveTips';
import { HELP } from '../lib/help';

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
          <span className="row">
            {a.archived ? (
              <TipPill tone="neutral" tip={ARCHIVED_AWARD_TIP}>
                Archived
              </TipPill>
            ) : null}
            <TipPill tone="neutral" tip={HELP.awardVersion.body}>
              Version {a.currentVersionId.replace(/^v/, '')}
            </TipPill>
          </span>
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
    return <NoAccess message="Only leaders can manage troop awards." ask="leader" />;
  }
  const active = awards.filter((a) => !a.archived);
  const archived = awards.filter((a) => a.archived);

  return (
    <>
      <PageHeader eyebrow="Troop" title="Troop awards">
        <HelpTip topic="troopAward" />
        {creating ? null : (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            New award
          </button>
        )}
      </PageHeader>
      <GuideBlock
        id="awards"
        purpose="A troop award is your own award with your own requirements, such as a service badge. It works like a merit badge."
        steps={[
          'Press New award and list the requirements.',
          'Scouts work on it, and leaders sign off each requirement.',
          'Change requirements any time. Each change makes a new version. Scouts keep their old version until you move them.',
        ]}
      />
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
      {!loading && active.length === 0 ? <NextStep action="Make your first award" onClick={() => setCreating(true)}>
          No troop awards yet. Create your first one.
        </NextStep> : null}
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
