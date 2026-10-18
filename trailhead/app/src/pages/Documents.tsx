import { DocumentsManager } from '../components/documents/DocumentsManager';
import { PageHeader } from '../components/ui';
import { useTroop } from '../lib/troop';
import { HelpTip } from '../components/HelpTip';

/** The troop's document library: permission slips, gear lists, the handbook and forms. */
export function Documents() {
  const { troopId, isLeader } = useTroop();
  return (
    <>
      <PageHeader eyebrow="Troop" title="Documents">
        <HelpTip topic="siteDocuments" />
      </PageHeader>
      <p className="muted">
        {isLeader
          ? 'Add documents for your troop. Choose who can see each one: the public (on your website), members, or leaders only.'
          : 'Forms, lists and handbooks shared by your troop leaders.'}
      </p>
      <DocumentsManager troopId={troopId} />
    </>
  );
}
