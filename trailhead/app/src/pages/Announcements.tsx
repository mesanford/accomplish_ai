import { useEffect, useRef, useState } from 'react';
import { AnnouncementCard } from '../components/AnnouncementCard';
import { AnnouncementComposer } from '../components/AnnouncementComposer';
import { NextStep } from '../components/NextStep';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';
import { markAnnouncementsSeen, useAnnouncementFeed } from '../lib/announcementFeed';
import { isUnread } from '../lib/announcements';
import { useTroop } from '../lib/troop';
import { HelpTip } from '../components/HelpTip';

/** Troop announcements and newsletters: a feed, newest first with pinned posts on top, and a form for leaders. */
export function Announcements() {
  const { troopId, has, access } = useTroop();
  const { uid, posts, lastSeenMs, loading, error } = useAnnouncementFeed();
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState('');
  // Unread markers use the time from before this visit, so they stay visible while the person reads.
  const seenOnArrival = useRef<number | null>(null);
  const canPost = has('leader', 'scoutmaster', 'advancement', 'committee');
  if (!loading && seenOnArrival.current === null) {
    seenOnArrival.current = lastSeenMs;
  }
  useEffect(() => {
    if (!loading && uid) {
      markAnnouncementsSeen(troopId, uid).catch(() => undefined); // the marker is a convenience
    }
  }, [loading, troopId, uid]);

  return (
    <>
      <PageHeader eyebrow="Troop" title="Announcements">
        <HelpTip topic="announcements" />
        {canPost ? (
          <button type="button" className="btn" onClick={() => setComposing((c) => !c)}>
            {composing ? 'Close' : 'New announcement'}
          </button>
        ) : null}
      </PageHeader>
      <p className="muted small">
        Announcements are one-way. To reply to a leader, send a message from the Messages page.
      </p>
      <Notice kind="ok">{notice}</Notice>
      {composing ? (
        <section className="card">
          <AnnouncementComposer
            onDone={(message) => {
              setComposing(false);
              setNotice(message);
            }}
          />
        </section>
      ) : null}
      <Notice kind="error">{error ? 'Announcements could not be loaded. Try again in a moment.' : ''}</Notice>
      {loading ? (
        <Loading />
      ) : posts.length === 0 ? (
        canPost ? (
          <NextStep action="Write an announcement" onClick={() => setComposing(true)}>
            No announcements yet. Post one to tell the troop what is coming up.
          </NextStep>
        ) : (
          <Empty>No announcements yet. Leaders post them here.</Empty>
        )
      ) : (
        <ul className="list">
          {posts.map((p) => (
            <AnnouncementCard
              key={p.id}
              post={p}
              unread={isUnread(p, seenOnArrival.current ?? lastSeenMs, uid)}
              canManage={p.postedByUid === uid || Boolean(access?.roles.includes('scoutmaster'))}
            />
          ))}
        </ul>
      )}
    </>
  );
}
