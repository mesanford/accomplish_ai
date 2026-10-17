import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, reviewConsentNotice } from '../lib/api';
import { CONSENT_NOTICE_VERSION } from '../lib/consent';
import { useParentReview } from '../lib/consentHooks';
import { changesSince, oldestVersion } from '../lib/consentReview';
import { joinList } from '../lib/formCheck';
import { useTroop } from '../lib/troop';
import { ConsentNotice } from './ConsentNotice';
import { Notice } from './ui';

/**
 * Shown on Home to a parent who agreed to an older version of the notice. It does not block anything: it stays until
 * they agree, or withdraw consent from their Scout's page. Saying they don't agree changes nothing on its own.
 */
export function NoticeUpdateCard() {
  const { troopId, troop, memberName } = useTroop();
  const stale = useParentReview();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (stale.length === 0) {
    return null;
  }
  const firstName = (id: string) => memberName(id).split(' ')[0];
  const names = joinList(stale.map((s) => firstName(s.id)));
  const changes = changesSince(oldestVersion(stale.map((s) => s.version)));

  async function agree() {
    setBusy(true);
    setError('');
    try {
      await reviewConsentNotice(troopId, CONSENT_NOTICE_VERSION);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-label="The parent notice changed">
      <h2>The notice for {names} changed</h2>
      <p>Here is what changed since you agreed:</p>
      {changes.length > 0 ? (
        <ul>
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p>The wording was updated.</p>
      )}
      <p className="small">Read the full notice below. You can keep using Forthright while you decide.</p>
      <ConsentNotice troopName={troop?.name ?? 'Your troop'} />
      <Notice kind="error">{error}</Notice>
      {asking ? (
        <div className="stack">
          <p className="small">
            If you don't agree, nothing is deleted and nothing changes yet. The troop keeps {names}'s records under the
            notice you agreed to before, and we will keep asking. If you want the troop to delete {names}'s records, withdraw
            your consent from your Scout's page.
          </p>
          <div className="row">
            {stale.map((s) => (
              <Link key={s.id} className="btn secondary small" to={`/t/${troopId}/scouts/${s.id}`}>
                Go to {firstName(s.id)}'s page to withdraw consent
              </Link>
            ))}
            <button type="button" className="btn quiet small" onClick={() => setAsking(false)}>
              Go back
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={agree}>
            {busy ? 'Saving…' : 'I agree'}
          </button>
          <button type="button" className="btn quiet" disabled={busy} onClick={() => setAsking(true)}>
            I don't agree
          </button>
        </div>
      )}
    </section>
  );
}
