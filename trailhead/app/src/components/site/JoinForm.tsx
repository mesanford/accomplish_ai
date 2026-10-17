import { forthrightUrl } from '../../lib/troopDomain';
import { type FormEvent, useState } from 'react';
import { errorMessage, type InterestForm, submitInterest } from '../../lib/api';

const EMPTY: InterestForm = {
  name: '',
  email: '',
  phone: '',
  scoutAge: '',
  message: '',
  website: '',
};

function Input({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="site-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <span className="site-muted small">{hint}</span> : null}
    </div>
  );
}

export function JoinForm({
  slug,
  intro,
  troopName,
}: {
  slug: string;
  intro?: string;
  troopName: string;
}) {
  const [form, setForm] = useState<InterestForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const set = (key: keyof InterestForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitInterest(slug, form);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="site-section site-join" id="join" aria-labelledby="join-title">
      <h2 id="join-title">Join us</h2>
      {intro ? <p style={{ whiteSpace: 'pre-line' }}>{intro}</p> : null}
      {sent ? (
        <div className="site-ok" role="status">
          <strong>Thank you.</strong> We got your message and a leader from {troopName} will be in
          touch soon.
        </div>
      ) : (
        <form className="site-form" onSubmit={submit}>
          <Input id="join-name" label="Parent or guardian name">
            <input
              id="join-name"
              required
              maxLength={80}
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
            />
          </Input>
          <Input id="join-email" label="Email">
            <input
              id="join-email"
              type="email"
              required
              maxLength={120}
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
            />
          </Input>
          <Input id="join-phone" label="Phone (optional)">
            <input
              id="join-phone"
              type="tel"
              maxLength={30}
              autoComplete="tel"
              value={form.phone}
              onChange={set('phone')}
            />
          </Input>
          <Input id="join-age" label="Scout's age or grade" hint="For example 11, or 6th grade.">
            <input id="join-age" maxLength={30} value={form.scoutAge} onChange={set('scoutAge')} />
          </Input>
          <Input id="join-message" label="Anything you'd like us to know">
            <textarea
              id="join-message"
              maxLength={1000}
              value={form.message}
              onChange={set('message')}
            />
          </Input>
          <div className="site-trap" aria-hidden="true">
            <label htmlFor="join-website">Leave this empty</label>
            <input
              id="join-website"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={set('website')}
            />
          </div>
          {error ? (
            <div className="site-err" role="alert">
              {error}
            </div>
          ) : null}
          <div>
            <button className="site-btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Tell me more'}
            </button>
          </div>
          <p className="site-muted small">
            We only use this to reply to you. Only this troop's leaders see it.{' '}
            <a href={forthrightUrl('/privacy')}>Privacy policy</a>
          </p>
        </form>
      )}
    </section>
  );
}
