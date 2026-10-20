// Announcements waiting to be sent: who can see them, and the words for when they go out.
import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from './firebase';
import { useQuery } from './hooks';
import type { ScheduledPost } from './types';

/** "Tue, Oct 27 at 7:00 pm", in the viewer's own time. */
export function sendTimeText(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${day} at ${time}`;
}

/** Waiting and failed posts, soonest first. Leaders see every one; anyone else who posts sees their own. */
export function useScheduledPosts(troopId: string, uid: string | undefined, isLeader: boolean, canPost: boolean) {
  const q = useMemo(() => {
    if (!uid || !canPost) {
      return null;
    }
    const base = collection(db, `troops/${troopId}/scheduledPosts`);
    const open = where('status', 'in', ['scheduled', 'failed']);
    return isLeader ? query(base, open) : query(base, open, where('postedByUid', '==', uid));
  }, [troopId, uid, isLeader, canPost]);
  const live = useQuery<ScheduledPost>(q, `${troopId}/scheduled/${uid}/${isLeader}`);
  const posts = [...live.data].sort((a, b) => a.sendAt.toMillis() - b.sendAt.toMillis());
  return { posts, loading: live.loading };
}

/** The datetime-local value for an hour from now, rounded to the next quarter hour: a sensible default. */
export function defaultSendAt(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
