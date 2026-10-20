import { collection, doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { importRsvps } from '../../lib/eventsApi';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import type { TroopEvent } from '../../lib/types';
import { Notice } from '../ui';

/** A leader's roster buttons: close or reopen sign-ups, and add earlier RSVPs. */
export function RosterTools({ troopId, event }: { troopId: string; event: TroopEvent }) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const rsvpQ = useMemo(
    () => collection(db, `troops/${troopId}/events/${event.id}/rsvps`),
    [troopId, event.id],
  );
  const rsvps = useQuery<{ id: string; going?: boolean }>(rsvpQ, `${event.id}/rsvps`);
  const earlier = rsvps.data.filter((r) => r.going).length;
  async function run(task: () => Promise<unknown>, done: string) {
    setError('');
    setMessage('');
    try {
      await task();
      setMessage(done);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const closed = Boolean(event.signups?.closed);
  return (
    <div className="stack">
      <div className="row">
        <button
          type="button"
          className="btn secondary small"
          onClick={() =>
            run(
              () =>
                updateDoc(doc(db, `troops/${troopId}/events/${event.id}`), {
                  'signups.closed': !closed,
                }),
              closed ? 'Sign-ups reopened.' : 'Sign-ups closed.',
            )
          }
        >
          {closed ? 'Reopen sign-ups' : 'Close sign-ups'}
        </button>
        {earlier > 0 ? (
          <button
            type="button"
            className="btn secondary small"
            onClick={() =>
              run(
                () =>
                  importRsvps(troopId, event.id).then((r) =>
                    setMessage(`Added ${r.imported} from earlier RSVPs.`),
                  ),
                '',
              )
            }
          >
            Add {earlier} earlier RSVPs to the roster
          </button>
        ) : null}
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{message}</Notice>
    </div>
  );
}
