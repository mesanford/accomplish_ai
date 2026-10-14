import { type EditDraft, LIMITS, type SiteDraft } from '../../lib/site';
import { useTroop } from '../../lib/troop';
import { Empty, Field } from '../ui';

/** Adult leaders families can contact. Scouts can't be chosen, and the public email is typed in on purpose. */
export function ContactsSection({ draft, onChange }: { draft: SiteDraft; onChange: EditDraft }) {
  const { members } = useTroop();
  const adults = members.filter((m) => m.kind === 'adult');
  const { contacts } = draft;
  const set = (i: number, patch: Partial<SiteDraft['contacts'][number]>) =>
    onChange({ contacts: contacts.map((c, n) => (n === i ? { ...c, ...patch } : c)) });

  return (
    <section className="card">
      <h2>Contacts</h2>
      <p className="muted small">
        Only adult leaders can be listed. Their name and the email you type here appear on the public site.
      </p>
      {contacts.length === 0 ? <Empty>No contacts yet.</Empty> : null}
      {contacts.map((c, i) => (
        <div key={i} className="row" style={{ alignItems: 'end' }}>
          <Field label={`Contact ${i + 1}`} htmlFor={`contact-${i}`}>
            <select id={`contact-${i}`} value={c.memberId} onChange={(e) => set(i, { memberId: e.target.value })}>
              <option value="">Choose a leader</option>
              {adults.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Contact ${i + 1} role`} htmlFor={`contact-role-${i}`}>
            <input
              id={`contact-role-${i}`}
              maxLength={60}
              value={c.role}
              placeholder="Scoutmaster"
              onChange={(e) => set(i, { role: e.target.value })}
            />
          </Field>
          <Field label={`Contact ${i + 1} public email`} htmlFor={`contact-email-${i}`}>
            <input
              id={`contact-email-${i}`}
              type="email"
              maxLength={120}
              value={c.email ?? ''}
              placeholder="scoutmaster@troop101.org"
              onChange={(e) => set(i, { email: e.target.value || null })}
            />
          </Field>
          <button
            type="button"
            className="btn quiet small"
            onClick={() => onChange({ contacts: contacts.filter((_, n) => n !== i) })}
          >
            Remove contact {i + 1}
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn secondary small"
          disabled={contacts.length >= LIMITS.contacts}
          onClick={() => onChange({ contacts: [...contacts, { memberId: '', role: '', email: null }] })}
        >
          Add a contact
        </button>
      </div>
    </section>
  );
}
