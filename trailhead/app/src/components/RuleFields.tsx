import type { RuleKind } from '../lib/campaigns';
import { Field } from './ui';

interface Props {
  id: string;
  kind: RuleKind;
  amount: string;
  onChange: (kind: RuleKind, amount: string) => void;
  disabled?: boolean;
}

/** How much of each Scout's sales is credited to their account: a percentage, an amount per item, or none. */
export function RuleFields({ id, kind, amount, onChange, disabled }: Props) {
  return (
    <div className="row" style={{ alignItems: 'end' }}>
      <Field label="Credit rule" htmlFor={`${id}-kind`}>
        <select
          id={`${id}-kind`}
          value={kind}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as RuleKind, amount)}
        >
          <option value="percent">A percentage of sales</option>
          <option value="perItem">An amount per item sold</option>
          <option value="none">None: all profit stays with the troop</option>
        </select>
      </Field>
      {kind === 'percent' ? (
        <Field label="Percent of sales" htmlFor={`${id}-value`} hint="0 keeps all profit with the troop.">
          <input
            id={`${id}-value`}
            inputMode="decimal"
            value={amount}
            disabled={disabled}
            onChange={(e) => onChange(kind, e.target.value)}
          />
        </Field>
      ) : null}
      {kind === 'perItem' ? (
        <Field label="Dollars per item" htmlFor={`${id}-value`}>
          <input
            id={`${id}-value`}
            inputMode="decimal"
            value={amount}
            disabled={disabled}
            onChange={(e) => onChange(kind, e.target.value)}
          />
        </Field>
      ) : null}
    </div>
  );
}
