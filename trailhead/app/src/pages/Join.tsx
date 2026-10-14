import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HelpTip } from '../components/HelpTip';
import { Field, Notice, PageHeader } from '../components/ui';
import { acceptInvite, errorMessage } from '../lib/api';

export function Join() {
  const { troopId = '', code = '' } = useParams();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [ypt, setYpt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await acceptInvite({ troopId, code, displayName, yptExpiresAt: ypt || undefined });
      navigate(`/t/${troopId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Invitation" title="Join your troop" />
      <p className="muted">
        Your leader invited you to the troop on Trailhead. Tell us your name and you will land on your troop's home page.
        <HelpTip topic="invite" />
      </p>
      <form className="form" onSubmit={submit}>
        <Field label="Your name" htmlFor="name" hint="Scouts: use the name your troop knows you by.">
          <input id="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field
          label="Youth Protection training expires"
          htmlFor="ypt"
          hint="Required for leaders, committee members and merit badge counselors. Parents and Scouts can leave it blank."
        >
          <input id="ypt" type="date" value={ypt} onChange={(e) => setYpt(e.target.value)} />
        </Field>
        <p className="small muted">
          What is Youth Protection training?
          <HelpTip topic="ypt" />
        </p>
        <Notice kind="error">{error}</Notice>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join troop'}
          </button>
        </div>
      </form>
    </>
  );
}
