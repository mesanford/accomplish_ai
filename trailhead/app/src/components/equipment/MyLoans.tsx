import { useLoansWhere } from '../../lib/equipmentHooks';
import { useTroop } from '../../lib/troop';
import { LoanList } from './LoanList';

function ScoutLoans({ scoutId }: { scoutId: string }) {
  const { memberName } = useTroop();
  const loans = useLoansWhere('scoutId', scoutId);
  return (
    <div className="stack">
      <h3>{memberName(scoutId)}</h3>
      <LoanList loans={loans.data} manage={false} empty="Nothing is checked out." />
    </div>
  );
}

/** For people who don't manage the gear: what they have checked out, and what their Scouts have. */
export function MyLoans() {
  const { access, actingScoutIds } = useTroop();
  const mine = useLoansWhere('toMemberId', access?.memberId ?? null);
  const children = actingScoutIds.filter((id) => id !== access?.memberId);
  return (
    <section className="stack" aria-label="Checked out to you">
      <h2>Checked out to you</h2>
      <LoanList loans={mine.data} manage={false} empty="Nothing is checked out to you." />
      {children.length > 0 ? <h2>Checked out to your Scouts</h2> : null}
      {children.map((id) => (
        <ScoutLoans key={id} scoutId={id} />
      ))}
    </section>
  );
}
