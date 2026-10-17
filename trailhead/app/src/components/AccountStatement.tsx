import { Link } from 'react-router-dom';
import { computeAccount, newestFirst } from '../lib/ledger';
import { formatCents } from '../lib/money';
import { useLedger, useMoneyAccess } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';
import { EntryList } from './EntryList';
import { Total } from './Money';
import { SettleAccount } from './SettleAccount';
import { Empty, formatDate, Loading, Notice } from './ui';

/** A Scout's statement: balance, open charges and every entry, newest first. Families see their own Scouts'. */
export function AccountStatement({ scoutId, heading = 'Scout account' }: { scoutId: string; heading?: string }) {
  const { troopId, members } = useTroop();
  const { isTreasurer, canSeeAccount, settings } = useMoneyAccess();
  const ledger = useLedger(scoutId);
  if (!canSeeAccount(scoutId)) {
    return null;
  }
  const state = computeAccount(ledger.data);
  const open = newestFirst(ledger.data).filter((e) => e.id in state.owed);
  const scout = members.find((m) => m.id === scoutId);

  return (
    <section className="stack" aria-label={heading}>
      <div className="row spread">
        <h2>{heading}</h2>
        {isTreasurer ? (
          <div className="row">
            <Link className="btn quiet small" to={`/t/${troopId}/accounts/payment?scout=${scoutId}`}>
              Record a payment
            </Link>
            <Link className="btn quiet small" to={`/t/${troopId}/accounts/charge?scout=${scoutId}`}>
              Post a charge
            </Link>
          </div>
        ) : null}
      </div>
      <Notice kind="error">{ledger.error}</Notice>
      <div className="totals">
        <Total label="Account balance" cents={state.balance} hint="Credit the troop holds for Scouting costs." />
        <Total label="Open charges" cents={state.openCents} hint="Still to pay the troop." />
      </div>
      {open.length > 0 ? (
        <ul className="small">
          {open.map((e) => (
            <li key={e.id}>
              {e.description}, {formatCents(state.owed[e.id])} open since {formatDate(e.date)}
            </li>
          ))}
        </ul>
      ) : null}
      {settings.creditPolicy ? (
        <p className="small muted">
          <strong>What account credit can pay for:</strong> {settings.creditPolicy}
        </p>
      ) : null}
      <p className="small muted">
        Forthright keeps this record. It does not take or hold money. Pay the troop as usual, and credit is never paid
        out as cash.
      </p>
      {isTreasurer && scout?.leftAt ? <SettleAccount scout={scout} balance={state.balance} /> : null}
      {ledger.loading ? <Loading /> : null}
      {!ledger.loading && ledger.data.length === 0 ? <Empty>No entries yet.</Empty> : null}
      {ledger.data.length > 0 ? <EntryList entries={ledger.data} state={state} canChange={isTreasurer} /> : null}
    </section>
  );
}
