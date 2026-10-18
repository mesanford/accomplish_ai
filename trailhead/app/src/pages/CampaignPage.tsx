import { doc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Total } from '../components/Money';
import { RuleFields } from '../components/RuleFields';
import { SalesTable } from '../components/SalesTable';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import {
  type Campaign,
  campaignTotals,
  ruleFromInput,
  type RuleKind,
  ruleText,
  ruleToInput,
  type SalesInput,
  salesFromInput,
} from '../lib/campaigns';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { plural } from '../lib/plural';
import { centsToInput, formatCents } from '../lib/money';
import { postSales, saveCampaign } from '../lib/moneyApi';
import { useMoneyAccess, useRosterScouts } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';
import { NoAccess } from '../components/NoAccess';

/** A fundraiser: its credit rule, each Scout's sales, the totals, and the button that credits the accounts. */
export function CampaignPage() {
  const { campaignId = 'new' } = useParams();
  const isNew = campaignId === 'new';
  const { troopId } = useTroop();
  const { isTreasurer, canSeeMoney, settings } = useMoneyAccess();
  const navigate = useNavigate();
  const scouts = useRosterScouts().filter((s) => !s.leftAt);
  const ref = useMemo(
    () => (canSeeMoney && !isNew ? doc(db, 'troops', troopId, 'campaigns', campaignId) : null),
    [troopId, campaignId, canSeeMoney, isNew],
  );
  const campaign = useDoc<Campaign>(ref);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RuleKind>(settings.defaultRule.kind);
  const [amount, setAmount] = useState(ruleToInput(settings.defaultRule));
  const [rows, setRows] = useState<SalesInput>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const loaded = campaign.data;
  useEffect(() => {
    if (!loaded) {
      return;
    }
    setName(loaded.name);
    setKind(loaded.rule.kind);
    setAmount(ruleToInput(loaded.rule));
    const next: SalesInput = {};
    for (const [id, r] of Object.entries(loaded.sales ?? {})) {
      next[id] = { sales: centsToInput(r.salesCents), items: r.items ? String(r.items) : '' };
    }
    setRows(next);
  }, [loaded?.id, loaded?.updatedAt?.toMillis?.()]);

  if (!canSeeMoney) {
    return <NoAccess message="Only the treasurer, the Scoutmaster and the advancement chair see fundraisers." ask="treasurer" />;
  }
  if (!isNew && campaign.loading) {
    return <Loading />;
  }
  if (!isNew && !loaded) {
    return <Empty>That fundraiser isn't in this troop.</Empty>;
  }
  const posted = loaded?.status === 'posted';
  const readOnly = posted || !isTreasurer;
  const rule = ruleFromInput(kind, amount);
  const { sales, problem } = salesFromInput(rows);
  const totals = rule ? campaignTotals(rule, sales) : null;

  async function save(thenPost: boolean) {
    setError('');
    setDone('');
    if (!name.trim() || !rule || problem) {
      setError(problem ?? (rule ? 'Give the fundraiser a name.' : 'Enter the credit rule as a number.'));
      return;
    }
    setBusy(true);
    try {
      const out = await saveCampaign({ troopId, ...(isNew ? {} : { campaignId }), name: name.trim(), rule, sales });
      if (thenPost) {
        const result = await postSales(troopId, out.campaignId);
        setDone(
          result.credited > 0
            ? `Posted. ${plural(result.credited, 'Scout account')} credited ${formatCents(result.creditCents)} in all.`
            : 'Posted. No Scout gets credit under this rule, so all profit stays with the troop.',
        );
      } else {
        setDone('Saved. Nothing is credited until you post.');
      }
      if (isNew) {
        navigate(`/t/${troopId}/accounts/campaigns/${out.campaignId}`, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={posted ? 'Fundraiser, posted' : 'Fundraiser'} title={isNew ? 'New fundraiser' : name} />
      <section className="card stack">
        <label htmlFor="campaign-name" style={{ fontWeight: 600 }}>
          Fundraiser name
        </label>
        <input
          id="campaign-name"
          value={name}
          readOnly={readOnly}
          placeholder="Fall popcorn 2026"
          onChange={(e) => setName(e.target.value)}
        />
        <RuleFields
          id="campaign-rule"
          kind={kind}
          amount={amount}
          disabled={readOnly}
          onChange={(k, a) => {
            setKind(k);
            setAmount(a);
          }}
        />
        <p className="small muted">{rule ? ruleText(rule) : 'Enter the credit rule as a number.'}</p>
      </section>
      {totals ? (
        <div className="totals">
          <Total label="Sales" cents={totals.salesCents} />
          <Total label="Scouts' credit" cents={totals.creditCents} />
          <Total label="Troop keeps" cents={totals.troopCents} />
        </div>
      ) : null}
      <SalesTable scouts={scouts} rows={rows} rule={rule} onChange={setRows} readOnly={readOnly} />
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      {readOnly ? (
        <p className="small muted">
          {posted ? 'This fundraiser is posted. Fix a wrong credit by reversing it on the Scout\'s account.' : 'Only the treasurer changes fundraisers.'}
        </p>
      ) : (
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>
            {busy ? 'Posting…' : 'Post credits to accounts'}
          </button>
          <button type="button" className="btn quiet" disabled={busy} onClick={() => save(false)}>
            Save for later
          </button>
        </div>
      )}
    </>
  );
}
