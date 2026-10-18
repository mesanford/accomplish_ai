import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CustomAwardForm } from '../components/CustomAwardForm';
import { HelpTip } from '../components/HelpTip';
import { TipPill } from '../components/TipPill';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';
import { archiveCustomAward, errorMessage } from '../lib/api';
import { ARCHIVED_AWARD_PAGE_TIP } from '../lib/archiveTips';
import { useCustomAwards, useCustomVersions } from '../lib/customAwardsContext';
import { useTroop } from '../lib/troop';
import type { CustomAwardVersion } from '../lib/types';
import { NoAccess } from '../components/NoAccess';

function VersionHistory({ versions, currentId }: { versions: CustomAwardVersion[]; currentId: string }) {
  const { memberName } = useTroop();
  return (
    <ul className="list">
      {versions.map((v) => (
        <li key={v.id}>
          <details style={{ width: '100%' }}>
            <summary>
              <strong>Version {v.id.replace(/^v/, '')}</strong>
              {v.id === currentId ? ' (current)' : ''}
              <span className="muted small">
                {' · '}
                {v.createdAt ? v.createdAt.toDate().toLocaleDateString() : 'Just now'}
                {v.createdByMemberId ? ` · ${memberName(v.createdByMemberId)}` : ''}
                {v.note ? ` · ${v.note}` : ''}
              </span>
            </summary>
            <ol className="small" style={{ listStyle: 'none', paddingLeft: 0 }}>
              {v.requirements.map((r) => (
                <li key={r.id}>
                  <strong>{r.label}.</strong> {r.text}
                </li>
              ))}
            </ol>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** One troop award: edit it (new versions for requirement changes), see its history, archive it. */
export function CustomAwardPage() {
  const { awardId = '' } = useParams();
  const { troopId, isLeader } = useTroop();
  const { byId, loading } = useCustomAwards();
  const versions = useCustomVersions(troopId, awardId);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const award = byId.get(awardId);

  if (!isLeader) {
    return <NoAccess message="Only leaders can manage troop awards." ask="leader" />;
  }
  if (loading || versions.loading) {
    return <Loading />;
  }
  if (!award) {
    return <Empty>This award doesn't exist. Go back to Troop awards and pick another.</Empty>;
  }
  const current = versions.data.find((v) => v.id === award.currentVersionId);

  async function setArchived(archived: boolean) {
    setError('');
    try {
      await archiveCustomAward({ troopId, awardId, archived });
      setSaved(archived ? 'Archived. Scouts keep their progress, but leaders can no longer sign it.' : 'Restored.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader eyebrow="Troop award" title={award.name}>
        <Link className="btn quiet small" to={`/t/${troopId}/awards`}>
          All troop awards
        </Link>
      </PageHeader>
      <Notice kind="ok">{saved}</Notice>
      <Notice kind="error">{error}</Notice>
      {award.archived ? (
        <section className="card">
          <div>
            <TipPill tone="neutral" tip={ARCHIVED_AWARD_PAGE_TIP}>
              Archived
            </TipPill>
          </div>
          <p>This award is archived. Restore it to edit it or sign its requirements.</p>
          <div>
            <button type="button" className="btn secondary small" onClick={() => setArchived(false)}>
              Restore award
            </button>
          </div>
        </section>
      ) : null}
      {!award.archived && current ? (
        <section className="card">
          <h2>Edit</h2>
          <CustomAwardForm
            key={`${award.currentVersionId}-${award.name}`}
            troopId={troopId}
            award={award}
            current={current.requirements}
            onSaved={(r) => setSaved(r.newVersion ? `Saved as version ${r.versionId.replace(/^v/, '')}.` : 'Saved.')}
          />
        </section>
      ) : null}
      <section className="stack">
        <h2 className="blazed">
          Versions
          <HelpTip topic="awardVersion" />
        </h2>
        <VersionHistory versions={versions.data} currentId={award.currentVersionId} />
      </section>
      {award.archived ? null : (
        <div>
          <button type="button" className="btn danger small" onClick={() => setArchived(true)}>
            Archive award
          </button>
        </div>
      )}
    </>
  );
}
