import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { errorMessage, withdrawParentConsent } from '../lib/api';
import { consentSummary } from '../lib/consent';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/hooks';
import { PRIVACY_EMAIL } from '../lib/privacy';
import { useTroop } from '../lib/troop';
import type { ConsentDoc, ConsentRequest, Member } from '../lib/types';
import { statusOf, statusWords } from './ConsentRequestPanel';
import { formatDate, Notice } from './ui';
import { PARENT_REQUEST_TIP } from '../lib/statusTips';
import { TipPill } from './TipPill';

/** Parent consent for a Scout: leaders see its status, and a parent can withdraw it. */
export function ParentConsent({ scout }: { scout: Member }) {
  const { troopId, parentOf, isLeader } = useTroop();
  const ref = useMemo(() => doc(db, `troops/${troopId}/consents/${scout.id}`), [troopId, scout.id]);
  const consent = useDoc<ConsentDoc>(ref);
  // The parents a leader emailed, and how each answered (leaders only; deleted after 30 days).
  const requestRef = useMemo(() => (isLeader ? doc(db, `troops/${troopId}/consentRequests/${scout.id}`) : null), [isLeader, troopId, scout.id]);
  const request = useDoc<ConsentRequest>(requestRef).data;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isParent = parentOf(scout.id);
  if (!isParent && !isLeader) {
    return null;
  }
  const summary = consentSummary(consent.data, (scout.guardianIds ?? []).length > 0);
  const first = scout.displayName.split(' ')[0] || 'this Scout';
  const email = PRIVACY_EMAIL ? (
    <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
  ) : (
    'the troop'
  );

  async function withdraw() {
    setBusy(true);
    setError('');
    try {
      await withdrawParentConsent(troopId, scout.id);
      setAsking(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="row spread">
        <h2>Parent consent</h2>
        <TipPill tone={summary.tone} tip={summary.tip}>
          {summary.text}
        </TipPill>
      </div>
      {summary.withdrawn ? (
        <p className="small">
          {isParent
            ? `You withdrew consent${consent.data?.withdrawal?.at ? ` on ${formatDate(consent.data.withdrawal.at.toDate().toISOString())}` : ''}. A leader will remove ${first}'s records. You can also email `
            : 'A parent withdrew consent. Remove this Scout’s records. The parent can also email '}
          {email}.
        </p>
      ) : null}
      {isParent && !summary.withdrawn && !asking ? (
        <button type="button" className="btn quiet small" onClick={() => setAsking(true)}>
          Withdraw consent
        </button>
      ) : null}
      {isParent && asking ? (
        <div className="stack">
          <p className="small">
            Withdrawing consent asks the troop to delete {first}'s information. A leader will remove the records, or you
            can email {email}. Until then, {first}'s records stay in Forthright.
          </p>
          <div className="row">
            <button type="button" className="btn small" disabled={busy} onClick={withdraw}>
              Withdraw consent for {first}
            </button>
            <button type="button" className="btn quiet small" disabled={busy} onClick={() => setAsking(false)}>
              Keep consent
            </button>
          </div>
        </div>
      ) : null}
      {isLeader && request && request.parents.length > 0 ? (
        <ul className="list" aria-label="Parents emailed">
          {request.parents.map((p) => (
            <li key={p.pid}>
              <span>{p.name}</span>
              <TipPill tip={PARENT_REQUEST_TIP[statusOf(request, p.pid)]}>{statusWords(request, p.pid)}</TipPill>
            </li>
          ))}
        </ul>
      ) : null}
      <Notice kind="error">{error}</Notice>
    </section>
  );
}
