import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Field, Notice } from '../components/ui';
import { errorMessage } from '../lib/api';
import { emailSignInLink } from '../lib/auth';
import { usingEmulators } from '../lib/firebase';

/** In local development the Auth emulator holds the emailed link; fetch it so sign-in works offline. */
async function emulatorLink(email: string): Promise<string | null> {
  const res = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-trailhead/oobCodes');
  const { oobCodes = [] } = (await res.json()) as { oobCodes?: { email: string; oobCode: string; requestType: string }[] };
  const latest = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  return latest ? `/signin/finish?mode=signIn&oobCode=${latest.oobCode}&apiKey=demo-key` : null;
}

export function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = params.get('next') || '/';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await emailSignInLink(email.trim(), next);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openDevLink() {
    const link = await emulatorLink(email.trim());
    if (link) {
      navigate(link);
    } else {
      setError('No sign-in link found in the Auth emulator yet.');
    }
  }

  return (
    <section className="stack" style={{ maxWidth: 520 }}>
      <div className="eyebrow">Trailhead</div>
      <h1>Sign in</h1>
      <p className="muted">
        Enter your email and we'll send you a sign-in link. There's no password to remember.
      </p>
      {sent ? (
        <div className="stack">
          <Notice kind="ok">Check your email. The link signs you in on this device.</Notice>
          {usingEmulators ? (
            <button type="button" className="btn secondary" onClick={openDevLink}>
              Open sign-in link (local emulator)
            </button>
          ) : null}
          <Notice kind="error">{error}</Notice>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <Field label="Email" htmlFor="email">
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Notice kind="error">{error}</Notice>
          <div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
