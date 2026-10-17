import { useState } from 'react';
import { type CreditRule, creditFor, parsePastedSales, type SalesInput } from '../lib/campaigns';
import { centsToInput, parseDollars } from '../lib/money';
import type { Member } from '../lib/types';
import { Money } from './Money';
import { Field, Notice } from './ui';

interface Props {
  scouts: Member[];
  rows: SalesInput;
  rule: CreditRule | null;
  onChange: (rows: SalesInput) => void;
  readOnly: boolean;
}

/** One row per Scout: sales in dollars, items sold, and the credit the rule gives. Rows can be pasted in. */
export function SalesTable({ scouts, rows, rule, onChange, readOnly }: Props) {
  const [paste, setPaste] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const row = (id: string) => rows[id] ?? { sales: '', items: '' };
  const set = (id: string, field: 'sales' | 'items', value: string) =>
    onChange({ ...rows, [id]: { ...row(id), [field]: value } });

  function applyPaste() {
    const result = parsePastedSales(paste, scouts);
    const next = { ...rows };
    for (const [id, r] of Object.entries(result.sales)) {
      next[id] = { sales: centsToInput(r.salesCents), items: r.items ? String(r.items) : '' };
    }
    onChange(next);
    setSkipped(result.skipped);
    setPaste('');
  }

  return (
    <div className="stack">
      <div className="table-box">
        <table>
          <thead>
            <tr>
              <th scope="col">Scout</th>
              <th scope="col" className="num">
                Sales ($)
              </th>
              <th scope="col" className="num">
                Items
              </th>
              <th scope="col" className="num">
                Credit
              </th>
            </tr>
          </thead>
          <tbody>
            {scouts.map((s) => {
              const cents = parseDollars(row(s.id).sales || '0') ?? 0;
              const items = Number(row(s.id).items || '0') || 0;
              return (
                <tr key={s.id}>
                  <td>{s.displayName}</td>
                  <td className="num">
                    <input
                      className="cell"
                      aria-label={`Sales for ${s.displayName}`}
                      inputMode="decimal"
                      value={row(s.id).sales}
                      readOnly={readOnly}
                      onChange={(e) => set(s.id, 'sales', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="cell"
                      aria-label={`Items sold by ${s.displayName}`}
                      inputMode="numeric"
                      value={row(s.id).items}
                      readOnly={readOnly}
                      onChange={(e) => set(s.id, 'items', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <Money cents={rule ? creditFor(rule, cents, items) : 0} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {readOnly ? null : (
        <details>
          <summary className="small">Paste from a spreadsheet</summary>
          <div className="stack">
            <Field
              label="Rows to paste"
              htmlFor="sales-paste"
              hint="One Scout per line: name, sales in dollars, and items sold if you track them."
            >
              <textarea id="sales-paste" value={paste} onChange={(e) => setPaste(e.target.value)} />
            </Field>
            <div className="row">
              <button type="button" className="btn quiet small" disabled={!paste.trim()} onClick={applyPaste}>
                Fill in the table
              </button>
            </div>
          </div>
        </details>
      )}
      {skipped.length > 0 ? (
        <Notice kind="warn">These lines did not match a Scout or an amount: {skipped.join(', ')}.</Notice>
      ) : null}
    </div>
  );
}
