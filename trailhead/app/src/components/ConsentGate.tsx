import { useState } from 'react';
import { answerPendingConsent, errorMessage } from '../lib/api';
import { CONSENT_NOTICE_VERSION } from '../lib/consent';
import { joinList } from '../lib/formCheck';
import { useTroop } from '../lib/troop';
import { ConsentNotice } from './ConsentNotice';
import { Notice, PageHeader } from './ui';

/**
 * Shown instead of the troop's pages to a parent a leader linked to Scouts. They agree to the notice, or decline,
 * before they go on. Consent is recorded only when they agree here.
 */
export function ConsentGate({ scoutIds }: { scoutIds: string[] }) {
  const { troopId, troop, memberName } = useTroop();
  const [agreed, setAgreed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const names = joinList(scoutIds.map(memberName));

  async function answer(consent: boolean) {
    if (consent && !agreed) {
      setError('Tick the box to agree, or choose not to agree.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await answerPendingConsent(troopId, { consent, consentVersion: CONSENT_NOTICE_VERSION });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={troop?.name ?? 'Your troop'} title="Agree to the parent notice" />
      <p>
        A leader linked you to {names} as a parent or guardian. Read the notice, then agree or choose not to agree. Until
        then you can't see their information.
      </p>
      <ConsentNotice troopName={troop?.name ?? 'Your troop'} />
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        I am the parent or guardian of {names}, and I agree.
      </label>
      <Notice kind="error">{error}</Notice>
      {asking ? (
        <div className="stack">
          <p className="small">
            If you don't agree, you are unlinked from {names}. You keep your other roles in the troop. A leader can link
            you again later.
          </p>
          <div className="row">
            <button type="button" className="btn secondary" disabled={busy} onClick={() => answer(false)}>
              Unlink me from {names}
            </button>
            <button type="button" className="btn quiet" disabled={busy} onClick={() => setAsking(false)}>
              Go back
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => answer(true)}>
            {busy ? 'Saving…' : 'Agree and continue'}
          </button>
          <button type="button" className="btn quiet" disabled={busy} onClick={() => setAsking(true)}>
            I don't agree
          </button>
        </div>
      )}
    </>
  );
}
