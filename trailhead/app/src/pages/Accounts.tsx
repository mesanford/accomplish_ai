import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CampaignList } from '../components/CampaignList';
import { Money, Total } from '../components/Money';
import { Loading, Notice, PageHeader } from '../components/ui';
import { accountName, type AccountDoc, GENERAL_FUND, isFormer } from '../lib/ledger';
import { balancesCsv, ledgerCsv } from '../lib/moneyCsv';
import { useAccounts, useLedger, useMoneyAccess, useRosterScouts } from '../lib/moneyHooks';
import { usePayments } from '../lib/paymentsHooks';
import { downloadCsv } from '../lib/scoutbook';
import { useTroop } from '../lib/troop';
import { HelpTip } from '../components/HelpTip';
import { NoAccess } from '../components/NoAccess';

/** The troop summary: money held in Scout accounts, open charges, every Scout's balance, and the export. */
export function Accounts() {
  const { troopId, memberName } = useTroop();
  const { isTreasurer, canSeeMoney } = useMoneyAccess();
  const accounts = useAccounts();
  const ledger = useLedger(null);
  const scouts = useRosterScouts();
  const [search, setSearch] = useState('');
  const payments = usePayments();

  if (!canSeeMoney) {
    return <NoAccess message="Only the treasurer, the Scoutmaster and the advancement chair see the troop's accounts." ask="treasurer" />;
  }
  const byId = new Map(accounts.data.map((a) => [a.id, a]));
  const nameOf = (id: string) => scouts.find((s) => s.id === id)?.displayName;
  const scoutAccounts = accounts.data.filter((a) => a.id !== GENERAL_FUND);
  const held = scoutAccounts.reduce((sum, a) => sum + a.balanceCents, 0);
  const open = scoutAccounts.reduce((sum, a) => sum + a.openChargesCents, 0);
  const fund = byId.get(GENERAL_FUND)?.balanceCents ?? 0;
  const former = accounts.data.filter((a) => isFormer(a.id) && (a.balanceCents || a.openChargesCents));
  const wanted = search.trim().toLowerCase();
  const shown = scouts.filter((s) => !wanted || s.displayName.toLowerCase().includes(wanted));
  const zero: Pick<AccountDoc, 'balanceCents' | 'openChargesCents'> = { balanceCents: 0, openChargesCents: 0 };
  const base = `/t/${troopId}/accounts`;
  const day = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader eyebrow="Scout accounts" title="Accounts">
        <HelpTip topic="scoutAccounts" />
        {payments.on && payments.connected ? (
          <Link className="btn quiet small" to={`${base}/payments`}>
            Card payments
          </Link>
        ) : null}
        {isTreasurer ? (
          <>
            <Link className="btn small" to={`${base}/charge`}>
              Post a charge
            </Link>
            <Link className="btn quiet small" to={`${base}/payment`}>
              Record a payment
            </Link>
            <Link className="btn quiet small" to={`${base}/settings`}>
              Account settings
            </Link>
          </>
        ) : null}
      </PageHeader>
      {!isTreasurer ? <p className="small muted">You can see the accounts. Only the treasurer changes them.</p> : null}
      <Notice kind="error">{accounts.error || ledger.error}</Notice>
      <div className="totals">
        <Total label="Held in Scout accounts" cents={held} />
        <Total label="Open charges" cents={open} hint="Families still to pay." />
        <Total label="Troop's general fund" cents={fund} hint="From Scouts who left." />
      </div>
      <CampaignList canChange={isTreasurer} />
      <section className="stack">
        <div className="row spread">
          <h2>Scout balances</h2>
          <div className="row">
            <button
              type="button"
              className="btn quiet small"
              onClick={() => downloadCsv(`accounts-${day}.csv`, balancesCsv(accounts.data, nameOf))}
            >
              Download balances
            </button>
            <button
              type="button"
              className="btn quiet small"
              onClick={() => downloadCsv(`ledger-${day}.csv`, ledgerCsv(ledger.data, nameOf))}
            >
              Download every entry
            </button>
          </div>
        </div>
        <label className="sr-only" htmlFor="account-search">
          Find a Scout
        </label>
        <input
          id="account-search"
          placeholder="Find a Scout"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {accounts.loading ? <Loading /> : null}
        <div className="table-box">
          <table>
            <thead>
              <tr>
                <th scope="col">Scout</th>
                <th scope="col" className="num">
                  Balance
                </th>
                <th scope="col" className="num">
                  Open charges
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const a = byId.get(s.id) ?? zero;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link to={`${base}/scouts/${s.id}`}>{s.displayName}</Link>
                      {s.leftAt ? <span className="small muted"> · Left the troop</span> : null}
                    </td>
                    <td className="num">
                      <Money cents={a.balanceCents} />
                    </td>
                    <td className="num">
                      <Money cents={a.openChargesCents} />
                    </td>
                  </tr>
                );
              })}
              {former.map((a) => (
                <tr key={a.id}>
                  <td>{accountName(a.id, memberName, a.scoutRef)}</td>
                  <td className="num">
                    <Money cents={a.balanceCents} />
                  </td>
                  <td className="num">
                    <Money cents={a.openChargesCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
