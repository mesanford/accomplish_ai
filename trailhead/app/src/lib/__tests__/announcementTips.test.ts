import { describe, expect, it } from 'vitest';
import { NEW_TIP, NEWSLETTER_TIP, PINNED_TIP } from '../announcementTips';

const TIPS = { Pinned: PINNED_TIP, New: NEW_TIP, Newsletter: NEWSLETTER_TIP };

/** Labels and buttons on the same screen, which browser tests look up by text. */
const NEARBY = [
  'pinned',
  'newsletter',
  'new announcement',
  'pin to the top',
  'edit',
  'delete',
  'keep it',
  'yes, delete it',
  'post',
  'upcoming events',
  'email me',
];

describe('announcement tips', () => {
  it('has a short plain sentence for each pill', () => {
    for (const tip of Object.values(TIPS)) {
      expect(tip.length).toBeGreaterThan(30);
      expect(tip.length).toBeLessThan(260);
    }
  });

  it.each(Object.entries(TIPS))('%s tip does not contain its own label or a nearby label', (label, tip) => {
    expect(tip.toLowerCase()).not.toContain(label.toLowerCase());
    for (const other of NEARBY) {
      expect(tip.toLowerCase()).not.toContain(other);
    }
  });
});
