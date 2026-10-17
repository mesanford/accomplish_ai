import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, requestPilot } from '../../lib/api';
import { EMPTY_PILOT, PILOT_ROLES, type PilotForm, pilotProblem } from '../../lib/pilotForm';
import { PILOT_STEPS } from './content';

function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="l-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <span className="l-hint">{hint}</span> : null}
    </div>
  );
}

function PilotFormView() {
  const [form, setForm] = useState<PilotForm>(EMPTY_PILOT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (key: keyof PilotForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = pilotProblem(form);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await requestPilot(form);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="l-ok" role="status">
        <strong>Thank you.</strong> We got your request. We will email you soon to set up your troop.
      </div>
    );
  }
  return (
    <form className="l-form" onSubmit={submit} noValidate>
      <Row id="pilot-name" label="Your name">
        <input id="pilot-name" required maxLength={80} autoComplete="name" value={form.name} onChange={set('name')} />
      </Row>
      <Row id="pilot-email" label="Email">
        <input id="pilot-email" type="email" required maxLength={120} autoComplete="email" value={form.email} onChange={set('email')} />
      </Row>
      <Row id="pilot-unit" label="Troop or unit number" hint="For example 303.">
        <input id="pilot-unit" required maxLength={40} value={form.unit} onChange={set('unit')} />
      </Row>
      <Row id="pilot-council" label="Council (optional)">
        <input id="pilot-council" maxLength={80} value={form.council} onChange={set('council')} />
      </Row>
      <Row id="pilot-role" label="Your role">
        <select id="pilot-role" required value={form.role} onChange={set('role')}>
          <option value="">Choose your role</option>
          {PILOT_ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Row>
      <Row id="pilot-note" label="Anything you'd like us to know (optional)">
        <textarea id="pilot-note" maxLength={1000} value={form.note} onChange={set('note')} />
      </Row>
      <div className="l-trap" aria-hidden="true">
        <label htmlFor="pilot-website">Leave this empty</label>
        <input id="pilot-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
      </div>
      {error ? (
        <div className="l-err" role="alert">
          {error}
        </div>
      ) : null}
      <div>
        <button className="l-btn" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send my request'}
        </button>
      </div>
      <p className="l-hint">
        We use your name and email only to reply about the pilot. <Link to="/privacy">Privacy policy</Link>
      </p>
    </form>
  );
}

export function PilotSection() {
  return (
    <section className="l-section l-pilot" id="pilot" aria-labelledby="pilot-title">
      <div className="l-wrap l-split">
        <div>
          <p className="l-label">The pilot</p>
          <h2 id="pilot-title">How the pilot works</h2>
          <ol className="l-steps">
            {PILOT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="l-formcard">
          <h3>Ask to join the pilot</h3>
          <PilotFormView />
        </div>
      </div>
    </section>
  );
}
