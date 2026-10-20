import { useState } from 'react';
import { cancelScheduledAnnouncement, errorMessage } from '../lib/api';
import { sendTimeText, useScheduledPosts } from '../lib/scheduledPosts';
import { useTroop } from '../lib/troop';
import { Notice } from './ui';

/** Posts waiting to go out (and any that couldn't), with a way to remove one. Only people who post see this. */
export function ScheduledPosts({ uid, canPost }: { uid: string | undefined; canPost: boolean }) {
  const { troopId, isLeader, access } = useTroop();
  const { posts } = useScheduledPosts(troopId, uid, isLeader, canPost);
  const [error, setError] = useState('');
  const manager = Boolean(access?.roles.some((r) => r === 'scoutmaster' || r === 'advancement'));
  if (posts.length === 0) {
    return null;
  }
  async function remove(id: string) {
    setError('');
    try {
      await cancelScheduledAnnouncement(troopId, id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section className="card stack" aria-label="Scheduled">
      <h2>Scheduled</h2>
      <ul className="list">
        {posts.map((p) => (
          <li key={p.id}>
            <span className="stack" style={{ gap: 2 }}>
              <strong>{p.title}</strong>
              <span className="small muted">
                {p.status === 'failed' ? 'Could not send' : `Sends ${sendTimeText(p.sendAt.toDate())}`} · {p.audienceLabel}
                {p.email ? ' · also emailed' : ''} · by {p.postedByName}
              </span>
              {p.status === 'failed' && p.reason ? <span className="small">{p.reason}</span> : null}
            </span>
            {p.postedByUid === uid || manager ? (
              <button type="button" className="btn danger small" onClick={() => void remove(p.id)}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <Notice kind="error">{error}</Notice>
    </section>
  );
}
