import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Money } from '../components/Money';
import { Empty, Field, formatDate, Notice, PageHeader, todayIso } from '../components/ui';
import { errorMessage } from '../lib/api';
import { computeAccount, newestFirst, type PayMethod } from '../lib/ledger';
import { formatCents, parseDollars } from '../lib/money';
import { recordPayment } from '../lib/moneyApi';
import { owedTotal, paymentProblem } from '../lib/moneyForms';
import { useLedger, useMoneyAccess, useRosterScouts } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';

/** The treasurer records money the family paid the troop (cash, check, other), or pays charges from credit. */
export function RecordPayment() {
  const { troopId } = useTroop();
  const { isTreasurer, settings } = useMoneyAccess();
  const [params] = useSearchParams();
  const scouts = useRosterScouts();
  const [scoutId, setScoutId] = useState(params.get('scout') ?? '');
  const ledger = useLedger(scoutId || null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  if (!isTreasurer) {
    return <Empty>Only the treasurer records payments.</Empty>;
  }
  const state = computeAccount(scoutId ? ledger.data : []);
  const open = newestFirst(ledger.data).filter((e) => e.id in state.owed).reverse(); // oldest first
  const chosenOwed = chosen.filter((id) => id in state.owed).map((id) => state.owed[id]);

  function toggle(id: string) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    setChosen(next);
    setAmount(owedTotal(next.filter((x) => x in state.owed).map((x) => state.owed[x])));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    const problem = paymentProblem({
      scoutId,
      amount,
      method,
      chosenOwed,
      balance: state.balance,
      allowNegative: settings.allowNegative,
    });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const cents = parseDollars(amount) ?? 0;
      const chargeIds = open.map((c) => c.id).filter((id) => chosen.includes(id));
      const out = await recordPayment({ troopId, scoutId, amountCents: cents, method, chargeIds, note, date });
      const extra = cents - out.coveredCents;
      setDone(
        extra > 0 && method !== 'credit'
          ? `Recorded ${formatCents(cents)}. ${formatCents(extra)} was added to the account as credit.`
          : `Recorded ${formatCents(cents)}.`,
      );
      setChosen([]);
      setAmount('');
      setNote('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Scout accounts" title="Record a payment" />
      <p className="small muted">Forthright only keeps the record. Deposit the money in the troop's bank account as usual.</p>
      <form className="form card stack" onSubmit={submit} aria-label="Record a payment">
        <Field label="Scout" htmlFor="pay-scout">
          <select
            id="pay-scout"
            value={scoutId}
            onChange={(e) => {
              setScoutId(e.target.value);
              setChosen([]);
            }}
          >
            <option value="">Choose a Scout</option>
            {scouts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </Field>
        {scoutId ? (
          <p className="small">
            Balance <Money cents={state.balance} /> · Open charges <Money cents={state.openCents} />
          </p>
        ) : null}
        {open.length > 0 ? (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>Open charges it pays</legend>
            {open.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.description}, {formatDate(c.date)}: {formatCents(state.owed[c.id])} open
              </label>
            ))}
          </fieldset>
        ) : null}
        <Field label="How the family paid" htmlFor="pay-method">
          <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="other">Other, such as a payment app</option>
            <option value="credit">From account credit</option>
          </select>
        </Field>
        <Field label="Amount" htmlFor="pay-amount" hint="Anything beyond the ticked charges is added as account credit.">
          <input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="pay-note" hint='Optional, like "Check 1042". Never a card or bank account number.'>
          <input id="pay-note" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Date paid" htmlFor="pay-date">
          <input id="pay-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{done}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </form>
    </>
  );
}
