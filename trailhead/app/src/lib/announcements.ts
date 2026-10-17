import type { Timestamp } from 'firebase/firestore';

export type AudienceType = 'troop' | 'parents' | 'adults' | 'leaders' | 'parentsOf' | 'patrolParents' | 'event';

export interface AudienceSpec {
  type: AudienceType;
  scoutIds?: string[];
  patrolId?: string;
  eventId?: string;
}

export interface NewsletterSection {
  heading: string;
  text: string;
}

export interface LinkedEvent {
  id: string;
  title?: string;
  start?: string;
  place?: string;
}

/** troops/{t}/announcements/{id}. Written only by the server. */
export interface Announcement {
  id: string;
  kind: 'announcement' | 'newsletter';
  title: string;
  body: string;
  sections: NewsletterSection[];
  events: LinkedEvent[];
  audience: AudienceSpec;
  audienceLabel: string;
  postedByUid: string;
  postedByName: string;
  pinned: boolean;
  emailed?: number;
  createdAt?: Timestamp | null;
  editedAt?: Timestamp | null;
}

export const AUDIENCE_CHOICES: { type: AudienceType; label: string }[] = [
  { type: 'troop', label: 'The whole troop' },
  { type: 'parents', label: 'All parents' },
  { type: 'adults', label: 'All adults' },
  { type: 'leaders', label: 'Leaders only' },
  { type: 'parentsOf', label: 'Parents of chosen Scouts' },
  { type: 'patrolParents', label: 'Parents of a patrol' },
  { type: 'event', label: 'Everyone signed up for an event' },
];

/** Audiences that reach Scouts. The server checks the real list; this only warns the poster early. */
export const reachesScouts = (type: AudienceType): boolean => type === 'troop' || type === 'event';

export const YPT_NOTE =
  'Announcements are one-way. Replies happen in Messages, where a parent or second adult is always copied. ' +
  'Only adults with current Youth Protection training can post to an audience that includes Scouts.';

export const ANNOUNCEMENT_EMAIL_LABEL = 'Email me troop announcements and newsletters';

export const announcementEmailsOn = (user: { emailAnnouncements?: boolean } | null | undefined): boolean =>
  user?.emailAnnouncements !== false;

export const toMillis = (ts: Timestamp | null | undefined): number => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);

/** Unread: posted after the person last opened Announcements, and not by them. Never opened means unread. */
export function isUnread(post: Announcement, lastSeenMs: number, uid: string | undefined): boolean {
  return post.postedByUid !== uid && toMillis(post.createdAt) > lastSeenMs;
}

/** Pinned posts first, then newest first. */
export function feedOrder(posts: Announcement[]): Announcement[] {
  return [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || toMillis(b.createdAt) - toMillis(a.createdAt));
}

/** The newest unread post, for the Home card. */
export function newestUnread(posts: Announcement[], lastSeenMs: number, uid: string | undefined): Announcement | null {
  const unread = posts.filter((p) => isUnread(p, lastSeenMs, uid));
  return unread.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))[0] ?? null;
}

/** Split typed text into paragraphs on blank lines. */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export const preview = (post: Announcement, max = 140): string => {
  const text = (post.body || post.sections[0]?.text || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};
