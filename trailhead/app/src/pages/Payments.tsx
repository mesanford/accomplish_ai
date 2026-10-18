import { Link } from 'react-router-dom';
import { Money } from '../components/Money';
import { Empty, formatDate, Loading, Notice, PageHeader } from '../components/ui';
import { useMoneyAccess, useRosterScouts } from '../lib/moneyHooks';
import { dashboardUrl, statusLabel } from '../lib/payments';
import { paymentsCsv } from '../lib/paymentsCsv';
import { usePaymentRecords, usePayments } from '../lib/paymentsHooks';
import { downloadCsv } from '../lib/scoutbook';
import { useTroop } from '../lib/troop';
import { NoAccess } from '../components/NoAccess';
import { HelpTip } from '../components/HelpTip';

/** Every card payment: status, links to the troop's Stripe dashboard, and the reconciliation spreadsheet. */
export function Payments() {
  const { troopId } = useTroop();
  const { canSeeMoney } = useMoneyAccess();
  const payments = usePayments();
  const records = usePaymentRecords(null, canSeeMoney);
  const scouts = useRosterScouts();

  if (!canSeeMoney) {
    return <NoAccess message="Only the treasurer, the Scoutmaster and the advancement chair see the troop's payments." ask="treasurer" />;
  }
  const nameOf = (id: string) => scouts.find((s) => s.id === id)?.displayName;
  const shown = records.data.filter((p) => p.status !== 'starting');
  const attention = shown.filter((p) => p.status === 'review' || p.dispute?.status);
  const day = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader eyebrow="Scout accounts" title="Card payments">
        <HelpTip topic="cardPayments" />
        <Link className="btn quiet small" to={`/t/${troopId}/accounts`}>
          All accounts
        </Link>
        <button
          type="button"
          className="btn quiet small"
          onClick={() => downloadCsv(`card-payments-${day}.csv`, paymentsCsv(shown, nameOf))}
        >
          Download for reconciling
        </button>
      </PageHeader>
      {payments.mode === 'test' ? <Notice kind="warn">Stripe test mode: no real money moved.</Notice> : null}
      <Notice kind="error">{records.error}</Notice>
      {attention.length > 0 ? (
        <Notice kind="warn">
          {attention.length === 1 ? '1 payment needs' : `${attention.length} payments need`} a look: a dispute, or a
          payment Forthright could not match. Check it in the Stripe dashboard, then post a correction if needed.
        </Notice>
      ) : null}
      <p className="small muted">
        A paid card payment is posted to the Scout's account automatically. Refunds made in Stripe post a reversal. The
        Stripe payment id matches the troop's Stripe payout report.
      </p>
      {records.loading ? <Loading /> : null}
      {!records.loading && shown.length === 0 ? <Empty>No card payments yet.</Empty> : null}
      {shown.length > 0 ? (
        <div className="table-box">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Scout</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  To account
                </th>
                <th scope="col" className="num">
                  Card total
                </th>
                <th scope="col">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const link = dashboardUrl(p);
                return (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td>
                    <td>{nameOf(p.scoutId) ?? 'Former Scout'}</td>
                    <td>{statusLabel(p)}</td>
                    <td className="num">
                      <Money cents={p.amountCents} />
                    </td>
                    <td className="num">
                      <Money cents={p.totalCents} />
                    </td>
                    <td>
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer">
                          View in Stripe
                        </a>
                      ) : (
                        <span className="small muted">Not paid</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
