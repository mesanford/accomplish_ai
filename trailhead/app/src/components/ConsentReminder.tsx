import { useState } from 'react';
import { errorMessage, type ReminderResult, sendConsentReminders } from '../lib/api';
import { joinList } from '../lib/formCheck';
import { plural } from '../lib/plural';
import { useTroop } from '../lib/troop';
import type { Member } from '../lib/types';
import { Notice } from './ui';

/** What the leader sees after sending: how many went out, and why some did not. */
export function reminderMessage(r: ReminderResult): string {
  const parts = [r.sent === 0 ? 'No reminders were sent.' : `Sent ${r.sent} ${r.sent === 1 ? 'reminder' : 'reminders'}.`];
  if (r.recentlyReminded > 0) {
    parts.push(`${r.recentlyReminded} already got one in the last 7 days.`);
  }
  if (r.optedOut > 0) {
    parts.push(`${r.optedOut} turned off email.`);
  }
  if (r.noAddress > 0) {
    parts.push(`${r.noAddress} have no email address on file.`);
  }
  if (r.remaining > 0) {
    parts.push(`${r.remaining} more are waiting. Send again to reach them.`);
  }
  return parts.join(' ');
}

/** Leaders: Scouts with a parent who has not reviewed the current notice, and a button to email those parents. */
export function ConsentReminder({ stale, scouts }: { stale: Map<string, string[]>; scouts: Member[] }) {
  const { troopId } = useTroop();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const waiting = scouts.filter((s) => stale.has(s.id));
  if (waiting.length === 0 && !result) {
    return null;
  }

  async function send() {
    setBusy(true);
    setError('');
    try {
      setResult(reminderMessage(await sendConsentReminders(troopId)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Notice kind="warn">
      {waiting.length > 0 ? (
        <p>
          The parent notice changed. {plural(waiting.length, 'Scout has', 'Scouts have')} a parent who hasn't reviewed it:{' '}
          {joinList(waiting.map((s) => s.displayName))}. They can keep using Forthright until they answer.
        </p>
      ) : null}
      <div className="row">
        <button type="button" className="btn small" disabled={busy || waiting.length === 0} onClick={send}>
          {busy ? 'Sending…' : 'Send a reminder to these parents'}
        </button>
      </div>
      {result ? <p role="status">{result}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </Notice>
  );
}
