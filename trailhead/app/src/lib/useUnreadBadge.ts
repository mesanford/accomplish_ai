import { useEffect } from 'react';
import { isUnread } from './announcements';
import { useAnnouncementFeed } from './announcementFeed';
import { useAuth } from './auth';
import { setBadge } from './badge';

/** Call inside a troop. Keeps the app icon's number equal to the unread announcements in that troop. */
export function useUnreadBadge(): void {
  const { user } = useAuth();
  const { posts, lastSeenMs, loading } = useAnnouncementFeed();
  const unread = loading ? null : posts.filter((p) => isUnread(p, lastSeenMs, user?.uid)).length;
  useEffect(() => {
    if (unread !== null) {
      setBadge(unread);
    }
  }, [unread]);
}
