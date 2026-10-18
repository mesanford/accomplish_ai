import { useState } from 'react';
import {
  cancelConsentRequest,
  errorMessage,
  type ParentContact,
  resendConsentRequest,
  setConsentParents,
} from '../lib/api';
import { useTroop } from '../lib/troop';
import type { ConsentRequest, Member, ParentRequestStatus } from '../lib/types';
import { emptyParent, filledParents, ParentEmailFields, parentsProblem } from './ParentEmailFields';
import { formatDate, Notice } from './ui';
import { HELD_EXISTING_TIP, HELD_NEW_TIP, PARENT_REQUEST_TIP } from '../lib/statusTips';
import { TipPill } from './TipPill';

const STATUS_WORDS: Record<ParentRequestStatus, string> = {
  emailed: 'Emailed',
  agreed: 'Agreed',
  declined: 'Declined',
  noAnswer: 'No answer',
};

/** What a parent's status shows once someone has agreed: the others are not asked any more. */
export function statusOf(request: ConsentRequest | undefined, pid: string): ParentRequestStatus {
  const parents = request?.parents ?? [];
  const mine = parents.find((p) => p.pid === pid)?.status ?? 'emailed';
  return mine === 'emailed' && parents.some((p) => p.status === 'agreed') ? 'noAnswer' : mine;
}

export const statusWords = (request: ConsentRequest | undefined, pid: string) => STATUS_WORDS[statusOf(request, pid)];

/**
 * For leaders: a Scout who is waiting for a parent's consent (new, under 13) or needs one (older record with only a
 * leader's confirmation). Shows each parent's status and lets the leader email again, add a parent, or cancel.
 */
export function ConsentRequestPanel({ scout, request }: { scout: Member; request?: ConsentRequest }) {
  const { troopId } = useTroop();
  const [adding, setAdding] = useState(false);
  const [parents, setParents] = useState<ParentContact[]>([emptyParent()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isNew = request?.deletesScout === true;

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setMessage(await action());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const resend = () =>
    run(async () => {
      const r = await resendConsentRequest(troopId, scout.id);
      return r.sent > 0 ? `Emailed ${r.sent}.` : 'Nobody was emailed: each parent gets one email a week, four in all.';
    });
  const add = () => {
    const problem = parentsProblem(parents);
    if (problem) {
      setError(problem);
      return;
    }
    void run(async () => {
      const r = await setConsentParents(troopId, scout.id, filledParents(parents));
      setAdding(false);
      setParents([emptyParent()]);
      return `Emailed ${r.sent}.`;
    });
  };
  const cancel = () =>
    run(async () => {
      const r = await cancelConsentRequest(troopId, scout.id);
      return r.removed ? `${scout.displayName} was deleted.` : 'The request was cancelled.';
    });

  return (
    <div className="stack">
      <TipPill tone="warn" tip={isNew ? HELD_NEW_TIP : HELD_EXISTING_TIP}>
        {isNew ? 'Waiting for parent consent' : 'Needs parent consent'}
      </TipPill>
      {request && request.parents.length > 0 ? (
        <ul className="list" aria-label={`Parents of ${scout.displayName}`}>
          {request.parents.map((p) => (
            <li key={p.pid}>
              <span>
                {p.name} <span className="muted small">{p.email}</span>
              </span>
              <TipPill tip={PARENT_REQUEST_TIP[statusOf(request, p.pid)]}>{STATUS_WORDS[statusOf(request, p.pid)]}</TipPill>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">
          {scout.displayName} has no parent consent on record. Enter a parent or guardian's email and send it. Nothing new
          is kept for this Scout until a parent agrees.
        </p>
      )}
      {request?.deleteAfter ? (
        <p className="small muted">
          If nobody agrees by {formatDate(request.deleteAfter.toDate().toISOString())},{' '}
          {isNew ? `${scout.displayName} and these email addresses are deleted.` : 'these email addresses are deleted.'}
        </p>
      ) : null}
      {adding || !request ? (
        <>
          <ParentEmailFields parents={parents} onChange={setParents} idPrefix={`parent-${scout.id}`} />
          <div className="row">
            <button type="button" className="btn small" disabled={busy} onClick={add}>
              Send the email
            </button>
            {request ? (
              <button type="button" className="btn quiet small" onClick={() => setAdding(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn small" disabled={busy} onClick={resend}>
            Send the email again
          </button>
          <button type="button" className="btn secondary small" disabled={busy} onClick={() => setAdding(true)}>
            Add another parent or guardian
          </button>
          <button type="button" className="btn quiet small" disabled={busy} onClick={cancel}>
            {isNew ? `Delete ${scout.displayName}` : 'Cancel this request'}
          </button>
        </div>
      )}
      <Notice kind="ok">{message}</Notice>
      <Notice kind="error">{error}</Notice>
    </div>
  );
}
