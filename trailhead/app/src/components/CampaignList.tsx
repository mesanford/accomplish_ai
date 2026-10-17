import { Link } from 'react-router-dom';
import { campaignTotals } from '../lib/campaigns';
import { useCampaigns } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';
import { Money } from './Money';
import { Empty } from './ui';

/** Fundraiser campaigns with their results: all sales, the Scouts' credit, and what the troop keeps. */
export function CampaignList({ canChange }: { canChange: boolean }) {
  const { troopId } = useTroop();
  const campaigns = useCampaigns();
  const base = `/t/${troopId}/accounts/campaigns`;
  const sorted = [...campaigns.data].sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));

  return (
    <section className="stack">
      <div className="row spread">
        <h2>Fundraisers</h2>
        {canChange ? (
          <Link className="btn quiet small" to={`${base}/new`}>
            New fundraiser
          </Link>
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <Empty>No fundraisers yet.</Empty>
      ) : (
        <div className="table-box">
          <table>
            <thead>
              <tr>
                <th scope="col">Fundraiser</th>
                <th scope="col" className="num">
                  Sales
                </th>
                <th scope="col" className="num">
                  Scouts' credit
                </th>
                <th scope="col" className="num">
                  Troop keeps
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const totals = campaignTotals(c.rule, c.sales ?? {});
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to={`${base}/${c.id}`}>{c.name}</Link>
                      <span className="small muted"> · {c.status === 'posted' ? 'Posted' : 'Open'}</span>
                    </td>
                    <td className="num">
                      <Money cents={totals.salesCents} />
                    </td>
                    <td className="num">
                      <Money cents={totals.creditCents} />
                    </td>
                    <td className="num">
                      <Money cents={totals.troopCents} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
