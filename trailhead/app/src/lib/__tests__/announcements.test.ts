import type { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  type Announcement,
  announcementEmailsOn,
  feedOrder,
  isUnread,
  newestUnread,
  paragraphs,
  preview,
  reachesScouts,
} from '../announcements';

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Timestamp;
const post = (id: string, ms: number, extra: Partial<Announcement> = {}): Announcement => ({
  id,
  kind: 'announcement',
  title: id,
  body: 'Body text',
  sections: [],
  events: [],
  audience: { type: 'troop' },
  audienceLabel: 'Whole troop',
  postedByUid: 'lead',
  postedByName: 'Pat',
  pinned: false,
  createdAt: ts(ms),
  ...extra,
});

describe('feedOrder', () => {
  it('puts pinned posts first and then the newest', () => {
    const order = feedOrder([post('old', 1), post('new', 3), post('pin', 0, { pinned: true }), post('mid', 2)]);
    expect(order.map((p) => p.id)).toEqual(['pin', 'new', 'mid', 'old']);
  });
});

describe('unread', () => {
  it('is a post made after the last visit by someone else', () => {
    expect(isUnread(post('a', 10), 5, 'mom')).toBe(true);
    expect(isUnread(post('a', 5), 5, 'mom')).toBe(false);
    expect(isUnread(post('a', 10), 5, 'lead')).toBe(false);
  });

  it('counts everything as unread before the first visit', () => {
    expect(isUnread(post('a', 10), 0, 'mom')).toBe(true);
  });

  it('finds the newest unread post for the Home card, or none', () => {
    const posts = [post('a', 10), post('b', 30), post('c', 20)];
    expect(newestUnread(posts, 15, 'mom')?.id).toBe('b');
    expect(newestUnread(posts, 30, 'mom')).toBeNull();
    expect(newestUnread([], 0, 'mom')).toBeNull();
  });
});

describe('text helpers', () => {
  it('splits paragraphs on blank lines', () => {
    expect(paragraphs('One\nstill one\n\nTwo\n \n\n')).toEqual(['One\nstill one', 'Two']);
  });

  it('shortens a preview and falls back to the first section', () => {
    expect(preview(post('a', 1, { body: 'x'.repeat(300) }), 20)).toHaveLength(20);
    expect(preview(post('a', 1, { body: '', sections: [{ heading: 'H', text: 'Section text' }] }))).toBe('Section text');
  });

  it('warns early only for audiences that include Scouts', () => {
    expect(reachesScouts('troop')).toBe(true);
    expect(reachesScouts('event')).toBe(true);
    expect(reachesScouts('parents')).toBe(false);
    expect(reachesScouts('leaders')).toBe(false);
  });

  it('keeps announcement emails on until the person turns them off', () => {
    expect(announcementEmailsOn(null)).toBe(true);
    expect(announcementEmailsOn({})).toBe(true);
    expect(announcementEmailsOn({ emailAnnouncements: false })).toBe(false);
  });
});
