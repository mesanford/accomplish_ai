import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field, Notice } from '../components/ui';
import { errorMessage } from '../lib/api';
import { finishSignIn, isSignInLink, rememberedEmail } from '../lib/auth';

export function FinishSignIn() {
  const navigate = useNavigate();
  const href = window.location.href;
  const valid = isSignInLink(href);
  const [email, setEmail] = useState(rememberedEmail());
  const [error, setError] = useState('');
  const tried = useRef(false);

  async function complete(address: string) {
    setError('');
    try {
      navigate(await finishSignIn(address, href), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    // Sign straight in when this is the device the link was requested on.
    if (valid && email && !tried.current) {
      tried.current = true;
      void complete(email);
    }
  }, []);

  if (!valid) {
    return (
      <section className="stack">
        <h1>That link doesn't work</h1>
        <p className="muted">Sign-in links can be used once and expire after a while.</p>
        <Link className="btn" to="/signin">
          Get a new link
        </Link>
      </section>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void complete(email.trim());
  }

  return (
    <section className="stack" style={{ maxWidth: 520 }}>
      <h1>Finish signing in</h1>
      <p className="muted">You opened the link on a different device or browser. Type the email address the link was sent to, and you will be signed in.</p>
      <form className="form" onSubmit={submit}>
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Notice kind="error">{error}</Notice>
        <div>
          <button className="btn" type="submit">
            Sign in
          </button>
        </div>
      </form>
    </section>
  );
}
