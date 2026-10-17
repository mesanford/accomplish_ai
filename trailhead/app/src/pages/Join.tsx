import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConsentNotice } from '../components/ConsentNotice';
import { HelpTip } from '../components/HelpTip';
import { Field, Notice, PageHeader } from '../components/ui';
import { acceptInvite, declineConsentRequest, errorMessage, getInviteNotice } from '../lib/api';
import { CONSENT_NOTICE_VERSION } from '../lib/consent';

export function Join() {
  const { troopId = '', code = '' } = useParams();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [ypt, setYpt] = useState('');
  const [notice, setNotice] = useState<Awaited<ReturnType<typeof getInviteNotice>> | null>(null);
  const [declined, setDeclined] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // If the invite can't be read here, the form still shows and the server explains the problem on submit.
    getInviteNotice(troopId, code).then(setNotice, () => setNotice(null));
  }, [troopId, code]);

  const parentNotice = notice?.role === 'parent' ? notice : null;
  const existing = notice?.alreadyMember === true;
  const joinLabel = existing ? 'Accept invite' : 'Join troop';

  async function decline() {
    setBusy(true);
    setError('');
    try {
      await declineConsentRequest(troopId, code);
      setDeclined(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await acceptInvite({
        troopId,
        code,
        displayName,
        yptExpiresAt: ypt || undefined,
        ...(parentNotice ? { consent: agreed, consentVersion: CONSENT_NOTICE_VERSION } : {}),
      });
      navigate(`/t/${troopId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (declined) {
    return (
      <>
        <PageHeader eyebrow="Invitation" title="Thank you for answering" />
        <p>
          You chose not to agree. We won't email you about {notice?.scoutFirstName ?? 'this Scout'} again, and you are not
          linked to them. If you change your mind, ask a troop leader to send a new link.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Invitation" title="Join your troop" />
      {notice?.scoutFirstName ? (
        <p>
          {notice.troopName} asked you to review the notice for {notice.scoutFirstName}. Only a parent or guardian can give
          permission. Until a parent agrees, the troop keeps nothing else about {notice.scoutFirstName} in Forthright.
        </p>
      ) : null}
      {existing ? (
        <p className="muted">
          You are already in {notice?.troopName}. Accepting this invite adds a role to your membership. You keep the roles
          you have.
          <HelpTip topic="invite" />
        </p>
      ) : (
        <p className="muted">
          Your leader invited you to the troop on Forthright. Tell us your name and you will land on your troop's home
          page.
          <HelpTip topic="invite" />
        </p>
      )}
      <form className="form" onSubmit={submit}>
        {existing ? null : (
          <Field label="Your name" htmlFor="name" hint="Scouts: use the name your troop knows you by.">
            <input id="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        )}
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
        {parentNotice ? (
          <>
            <ConsentNotice troopName={parentNotice.troopName} />
            <label className="check">
              <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              I am this Scout's parent or guardian, and I agree.
            </label>
          </>
        ) : null}
        <Notice kind="error">{error}</Notice>
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Joining…' : joinLabel}
          </button>
          {notice?.scoutFirstName ? (
            <button type="button" className="btn quiet" disabled={busy} onClick={decline}>
              I don't agree
            </button>
          ) : null}
        </div>
      </form>
    </>
  );
}
