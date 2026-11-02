import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, requestToJoin, type TroopMatch } from '../lib/api';
import { DEFAULT_CREATOR_ROLE } from '../lib/creatorRole';
import { stillNeeded } from '../lib/formCheck';
import { Notice, PageHeader } from './ui';
import { type You, YouFields } from './YouFields';

/** Ask a troop's leaders to let you in, with the name, role and training date from the create form. */
export function AskToJoin({ troop, start, onBack }: { troop: TroopMatch; start: You; onBack: () => void }) {
  const [you, setYou] = useState<You>(start);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const missing = stillNeeded([
      ['your name', you.displayName],
      ['the date your Youth Protection training expires', you.yptExpiresAt],
    ]);
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    try {
      await requestToJoin({
        troopId: troop.troopId,
        displayName: you.displayName,
        creatorRole: you.creatorRole ?? DEFAULT_CREATOR_ROLE,
        yptExpiresAt: you.yptExpiresAt,
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <PageHeader eyebrow="Ask to join" title="Request sent" />
        <p>
          We let the leaders of {troop.name} know. When one of them approves you, we'll email you and the troop shows on
          your home page.
        </p>
        <p>
          <Link className="btn" to="/">
            Go to your home page
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Ask to join" title={troop.name} />
      <p className="muted">
        We'll ask the troop's leaders to let you in. They see your name, your email address and the role you pick.
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <YouFields you={you} onChange={setYou} />
        <Notice kind="error">{error}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
          <button type="button" className="btn quiet" disabled={busy} onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </>
  );
}
