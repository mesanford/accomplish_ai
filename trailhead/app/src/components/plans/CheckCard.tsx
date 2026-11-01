import { type FormEvent, useState } from 'react';
import { type CheckResult, safeLink } from '../../lib/plans';
import { acknowledgeCheck } from '../../lib/plansApi';
import { useTroop } from '../../lib/troop';
import { formatDate, Notice } from '../ui';
import { CheckChip } from './StatusChip';
import { useAction } from './useAction';

/** One readiness check: what it found, the rule behind it and who last verified the rule. */
export function CheckCard({
  troopId,
  planId,
  check,
  isLeader,
  onResults,
}: {
  troopId: string;
  planId: string;
  check: CheckResult;
  isLeader: boolean;
  onResults: (results: CheckResult[]) => void;
}) {
  const { memberName } = useTroop();
  const [note, setNote] = useState('');
  const act = useAction();
  const link = safeLink(check.sourceUrl);

  async function send(text: string, remove: boolean) {
    const results = await acknowledgeCheck(troopId, planId, check.id, text, remove);
    onResults(results.results);
    setNote('');
  }
  function acknowledge(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      act.setError('Write a note saying why this is fine.');
      return;
    }
    void act.run(() => send(note.trim(), false), 'Acknowledged.');
  }

  return (
    <li className="card stack">
      <div className="row spread">
        <h3>{check.title}</h3>
        <CheckChip status={check.status} />
      </div>
      <p>{check.message}</p>
      <p className="small">
        <strong>Rule:</strong> {check.text}
      </p>
      <p className="muted small">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer">
            Source
          </a>
        ) : (
          'No source link'
        )}
        {` · Confidence: ${check.confidence}`}
        {check.required ? ' · Required' : ''}
        {' · '}
        {check.verifiedOn ? `Checked by the rule owner on ${formatDate(check.verifiedOn)}` : 'Not yet checked by the rule owner'}
      </p>
      {check.ack ? (
        <p className="small">
          Acknowledged{check.ack.byMemberId ? ` by ${memberName(check.ack.byMemberId)}` : ''}: {check.ack.note}
        </p>
      ) : null}
      {isLeader && check.status === 'acknowledged' ? (
        <div>
          <button className="btn secondary small" type="button" disabled={act.busy} onClick={() => act.run(() => send('', true), 'Removed.')}>
            Remove acknowledgement
          </button>
        </div>
      ) : null}
      {isLeader && (check.status === 'fail' || check.status === 'unknown') ? (
        <form className="form" onSubmit={acknowledge}>
          <label htmlFor={`ack-${check.id}`}>Why this is fine to go ahead (required)</label>
          <input id={`ack-${check.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <div>
            <button className="btn secondary small" type="submit" disabled={act.busy}>
              Acknowledge
            </button>
          </div>
        </form>
      ) : null}
      <Notice kind="error">{act.error}</Notice>
    </li>
  );
}
