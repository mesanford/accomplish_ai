import { type FormEvent, useEffect, useState } from 'react';
import { RuleFields } from '../components/RuleFields';
import { Empty, Field, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { type AccountSettings as Settings, ruleFromInput, type RuleKind, ruleText, ruleToInput } from '../lib/campaigns';
import { saveAccountSettings } from '../lib/moneyApi';
import { useMoneyAccess } from '../lib/moneyHooks';
import { useTroop } from '../lib/troop';

/** The troop's account rules, chosen by the treasurer and shown to families. */
export function AccountSettings() {
  const { troopId } = useTroop();
  const { isTreasurer, settings } = useMoneyAccess();
  const [kind, setKind] = useState<RuleKind>(settings.defaultRule.kind);
  const [amount, setAmount] = useState(ruleToInput(settings.defaultRule));
  const [allowNegative, setAllowNegative] = useState(settings.allowNegative);
  const [policy, setPolicy] = useState(settings.creditPolicy);
  const [leaving, setLeaving] = useState<Settings['leavingDefault']>(settings.leavingDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const savedKey = JSON.stringify(settings);

  useEffect(() => {
    setKind(settings.defaultRule.kind);
    setAmount(ruleToInput(settings.defaultRule));
    setAllowNegative(settings.allowNegative);
    setPolicy(settings.creditPolicy);
    setLeaving(settings.leavingDefault);
  }, [savedKey]);

  if (!isTreasurer) {
    return <Empty>Only the treasurer changes the troop's account settings.</Empty>;
  }
  const rule = ruleFromInput(kind, amount);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    if (!rule) {
      setError('Enter the credit rule as a number.');
      return;
    }
    setBusy(true);
    try {
      await saveAccountSettings({ troopId, defaultRule: rule, allowNegative, creditPolicy: policy.trim(), leavingDefault: leaving });
      setDone('Saved. Families see these rules on their Scout\'s account.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Scout accounts" title="Account settings" />
      <p className="small muted">
        Confirm these with your troop committee and chartered organization. Forthright never pays credit out as cash.
      </p>
      <form className="form card stack" onSubmit={submit} aria-label="Account settings">
        <h2>Default credit rule for new fundraisers</h2>
        <RuleFields
          id="default-rule"
          kind={kind}
          amount={amount}
          onChange={(k, a) => {
            setKind(k);
            setAmount(a);
          }}
        />
        <p className="small muted">{rule ? ruleText(rule) : 'Enter the credit rule as a number.'}</p>
        <h2>Balances below zero</h2>
        <label className="check">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          Let a charge take a balance below zero
        </label>
        <p className="small muted">
          {allowNegative
            ? 'A charge paid from credit takes the full amount. A balance below zero is what the family owes.'
            : 'A charge larger than the balance stays open for the family to pay.'}
        </p>
        <Field
          label="What account credit can pay for"
          htmlFor="credit-policy"
          hint="Families see this. For example: campouts, summer camp, dues, uniforms and books."
        >
          <textarea id="credit-policy" maxLength={600} value={policy} onChange={(e) => setPolicy(e.target.value)} />
        </Field>
        <Field label="When a Scout leaves, move their balance to" htmlFor="leaving-default">
          <select id="leaving-default" value={leaving} onChange={(e) => setLeaving(e.target.value as Settings['leavingDefault'])}>
            <option value="general">The troop's general fund</option>
            <option value="sibling">A sibling in the troop, if there is one</option>
          </select>
        </Field>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{done}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </>
  );
}
