import { useState } from 'react';
import { AnnouncementComposer } from './AnnouncementComposer';
import { TipPill } from './TipPill';
import { Notice, formatDate } from './ui';
import { deleteAnnouncement, errorMessage } from '../lib/api';
import { type Announcement, paragraphs, toMillis } from '../lib/announcements';
import { NEW_TIP, NEWSLETTER_TIP, PINNED_TIP } from '../lib/announcementTips';
import { useTroop } from '../lib/troop';

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {paragraphs(text).map((p, i) => (
        <p key={i} style={{ whiteSpace: 'pre-line', margin: 0 }}>
          {p}
        </p>
      ))}
    </>
  );
}

interface Props {
  post: Announcement;
  unread: boolean;
  /** The poster, a Scoutmaster or an advancement chair. */
  canManage: boolean;
}

export function AnnouncementCard({ post, unread, canManage }: Props) {
  const { troopId } = useTroop();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const posted = post.createdAt ? new Date(toMillis(post.createdAt)).toISOString() : '';

  async function remove() {
    setError('');
    try {
      await deleteAnnouncement(troopId, post.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (editing) {
    return (
      <li id={post.id}>
        <AnnouncementComposer editing={post} onDone={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li id={post.id} className="stack" style={{ gap: 8, display: 'block' }}>
      <div className="row" style={{ gap: 6 }}>
        {post.pinned ? (
          <TipPill tone="neutral" tip={PINNED_TIP}>
            Pinned
          </TipPill>
        ) : null}
        {unread ? (
          <TipPill tone="good" tip={NEW_TIP}>
            New
          </TipPill>
        ) : null}
        {post.kind === 'newsletter' ? (
          <TipPill tone="neutral" tip={NEWSLETTER_TIP}>
            Newsletter
          </TipPill>
        ) : null}
      </div>
      <h3 style={{ margin: '6px 0 2px' }}>{post.title}</h3>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        {post.postedByName} · {formatDate(posted)} · {post.audienceLabel}
        {post.editedAt ? ' · Edited' : ''}
      </p>
      <div className="stack" style={{ gap: 8 }}>
        <Paragraphs text={post.body} />
        {post.sections.map((s, i) => (
          <section key={i} className="stack" style={{ gap: 4 }}>
            {s.heading ? <h4 style={{ margin: 0 }}>{s.heading}</h4> : null}
            <Paragraphs text={s.text} />
          </section>
        ))}
        {post.events.length > 0 ? (
          <section className="stack" style={{ gap: 2 }}>
            <h4 style={{ margin: 0 }}>Upcoming events</h4>
            {post.events.map((ev) => (
              <span key={ev.id}>
                {ev.title}, {formatDate(ev.start)}
                {ev.place ? `, ${ev.place}` : ''}
              </span>
            ))}
          </section>
        ) : null}
      </div>
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        To reply, send a message. Announcements are one-way.
      </p>
      {canManage ? (
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn secondary small" onClick={() => setEditing(true)}>
            Edit
          </button>
          {confirming ? (
            <>
              <button type="button" className="btn danger small" onClick={remove}>
                Yes, delete it
              </button>
              <button type="button" className="btn quiet small" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn quiet small" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
      ) : null}
      <Notice kind="error">{error}</Notice>
    </li>
  );
}
