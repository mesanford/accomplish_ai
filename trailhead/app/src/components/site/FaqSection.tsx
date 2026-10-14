import { type EditDraft, LIMITS, type SiteDraft } from '../../lib/site';
import { Empty, Field } from '../ui';

/** Questions families often ask, with answers. */
export function FaqSection({ draft, onChange }: { draft: SiteDraft; onChange: EditDraft }) {
  const { faq } = draft;
  const set = (i: number, patch: Partial<{ q: string; a: string }>) =>
    onChange({ faq: faq.map((item, n) => (n === i ? { ...item, ...patch } : item)) });

  return (
    <section className="card">
      <h2>Questions families ask</h2>
      {faq.length === 0 ? <Empty>No questions yet. Families often ask about cost, uniforms and camping.</Empty> : null}
      {faq.map((item, i) => (
        <div key={i} className="card" style={{ background: 'transparent' }}>
          <Field label={`Question ${i + 1}`} htmlFor={`faq-q-${i}`}>
            <input id={`faq-q-${i}`} maxLength={200} value={item.q} onChange={(e) => set(i, { q: e.target.value })} />
          </Field>
          <Field label={`Answer ${i + 1}`} htmlFor={`faq-a-${i}`}>
            <textarea id={`faq-a-${i}`} maxLength={1000} value={item.a} onChange={(e) => set(i, { a: e.target.value })} />
          </Field>
          <div>
            <button
              type="button"
              className="btn quiet small"
              onClick={() => onChange({ faq: faq.filter((_, n) => n !== i) })}
            >
              Remove question {i + 1}
            </button>
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn secondary small"
          disabled={faq.length >= LIMITS.faq}
          onClick={() => onChange({ faq: [...faq, { q: '', a: '' }] })}
        >
          Add a question
        </button>
      </div>
    </section>
  );
}
