import { Link } from 'react-router-dom';
import { HealthFormCard } from '../components/HealthFormCard';
import { Empty, PageHeader } from '../components/ui';
import { useTroop } from '../lib/troop';

/** Health form dates for the signed-in person and for the Scouts they act for. */
export function HealthForms() {
  const { troopId, access, actingScoutIds, isLeader, memberName } = useTroop();
  const me = access?.memberId;
  const others = actingScoutIds.filter((id) => id !== me);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Health forms">
        {isLeader ? (
          <Link className="btn quiet small" to={`/t/${troopId}/roster`}>
            See everyone on the Roster
          </Link>
        ) : null}
      </PageHeader>
      <p className="muted">
        Record the date on the BSA Annual Health and Medical Record. Parts A and B are one date. Part C, the physical, has
        its own date.
      </p>
      {me ? <HealthFormCard memberId={me} name="you" /> : <Empty>There is no one to record health forms for.</Empty>}
      {others.map((id) => (
        <HealthFormCard key={id} memberId={id} name={memberName(id)} />
      ))}
    </>
  );
}
