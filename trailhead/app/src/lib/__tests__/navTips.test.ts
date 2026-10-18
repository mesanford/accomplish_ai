import { describe, expect, it } from 'vitest';
import { NAV_TIPS } from '../navTips';

/** Every menu label in the troop navigation. A hint must not contain any of them (tests find links by text). */
const MENU_LABELS = [
  'Home',
  'Roster',
  'Patrols',
  'Blue cards',
  'Scoutbook',
  'Recharter',
  'Activity report',
  'Merit badge counseling',
  'Events',
  'Badges',
  'Path templates',
  'Troop awards',
  'Recruiting',
  'Announcements',
  'Messages',
  'Health forms',
  'Documents',
  'Equipment',
  'Website',
  'Accounts',
  'Help',
];

describe('NAV_TIPS', () => {
  it('has a hint for Scoutbook and Recharter only', () => {
    expect(Object.keys(NAV_TIPS).sort()).toEqual(['Recharter', 'Scoutbook']);
  });

  it('never contains a menu label', () => {
    for (const [label, tip] of Object.entries(NAV_TIPS)) {
      expect(tip.length).toBeGreaterThan(20);
      for (const other of MENU_LABELS) {
        expect(tip.toLowerCase(), `${label} hint contains "${other}"`).not.toContain(other.toLowerCase());
      }
    }
  });
});
