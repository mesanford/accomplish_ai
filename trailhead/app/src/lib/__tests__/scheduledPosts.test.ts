import { describe, expect, it } from 'vitest';
import { defaultSendAt, sendTimeText } from '../scheduledPosts';

describe('scheduled posts', () => {
  it('says when a post goes out', () => {
    expect(sendTimeText(new Date(2026, 9, 27, 19, 0))).toBe('Tue, Oct 27 at 7:00 pm');
  });

  it('defaults to about an hour ahead, on a quarter hour', () => {
    expect(defaultSendAt(new Date(2026, 9, 20, 9, 7))).toBe('2026-10-20T10:15');
    expect(defaultSendAt(new Date(2026, 9, 20, 23, 50))).toBe('2026-10-21T01:00');
  });
});
