import { Link, useParams } from 'react-router-dom';
import { AccountStatement } from '../components/AccountStatement';
import { Empty, PageHeader } from '../components/ui';
import { useMoneyAccess } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';

/** One Scout's account, reached from the troop summary. Works for a treasurer who can't open the Scout's page. */
export function ScoutStatement() {
  const { scoutId = '' } = useParams();
  const { troopId, members, visibleScoutIds } = useTroop();
  const { canSeeAccount } = useMoneyAccess();
  const scout = members.find((m) => m.id === scoutId);
  if (!canSeeAccount(scoutId)) {
    return <Empty>You can only see your own Scouts' accounts.</Empty>;
  }
  return (
    <>
      <PageHeader eyebrow="Scout account" title={scout?.displayName ?? 'Scout'}>
        <Link className="btn quiet small" to={`/t/${troopId}/accounts`}>
          All accounts
        </Link>
        {visibleScoutIds.includes(scoutId) ? (
          <Link className="btn quiet small" to={`/t/${troopId}/scouts/${scoutId}`}>
            Scout's page
          </Link>
        ) : null}
      </PageHeader>
      <AccountStatement scoutId={scoutId} heading="Statement" />
    </>
  );
}
