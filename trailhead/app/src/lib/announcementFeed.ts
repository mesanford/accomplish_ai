import { collection, doc, orderBy, query, serverTimestamp, setDoc, type Timestamp, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useAuth } from './auth';
import { type Announcement, feedOrder, toMillis } from './announcements';
import { db } from './firebase';
import { useDoc, useQuery } from './hooks';
import { useTroop } from './troop';

/** The announcements this person can read, pinned and newest first, and when they last opened the feed. */
export function useAnnouncementFeed() {
  const { user } = useAuth();
  const { troopId } = useTroop();
  const uid = user?.uid;
  const q = useMemo(
    () =>
      uid
        ? query(
            collection(db, `troops/${troopId}/announcements`),
            where('readerUids', 'array-contains', uid),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [troopId, uid],
  );
  const posts = useQuery<Announcement>(q, `${troopId}/announcements/${uid}`);
  const seenRef = useMemo(() => (uid ? doc(db, 'troops', troopId, 'announcementReads', uid) : null), [troopId, uid]);
  const seen = useDoc<{ lastSeenAt?: Timestamp }>(seenRef);
  return {
    uid,
    posts: feedOrder(posts.data),
    lastSeenMs: toMillis(seen.data?.lastSeenAt),
    loading: posts.loading || seen.loading,
    error: posts.error,
  };
}

/** Record that the person has now seen everything posted so far. The server's clock sets the time. */
export function markAnnouncementsSeen(troopId: string, uid: string): Promise<void> {
  return setDoc(doc(db, 'troops', troopId, 'announcementReads', uid), { lastSeenAt: serverTimestamp() });
}
