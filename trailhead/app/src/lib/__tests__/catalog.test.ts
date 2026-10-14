import { describe, expect, it } from 'vitest';
import { awardName, BADGES, eagleLabel, RANKS, searchBadges, versionFor } from '../catalog';

describe('catalog', () => {
  it('loads every current merit badge and the ranks in order', () => {
    expect(BADGES).toHaveLength(138);
    expect(RANKS.map((r) => r.id)).toEqual(['scout', 'tenderfoot', 'second-class', 'first-class', 'star', 'life', 'eagle']);
  });

  it('names badges and ranks alike', () => {
    expect(awardName('personal-management')).toBe('Personal Management');
    expect(awardName('life')).toBe('Life');
    expect(awardName('unknown-id')).toBe('unknown-id');
  });

  it('uses the rank version for ranks and the badge version for badges', () => {
    expect(versionFor('star')).not.toBe(versionFor('chess'));
  });

  it('labels Eagle-required badges and choice groups', () => {
    const camping = BADGES.find((b) => b.id === 'camping');
    const hiking = BADGES.find((b) => b.id === 'hiking');
    const chess = BADGES.find((b) => b.id === 'chess');
    expect(camping && eagleLabel(camping)).toBe('Eagle required');
    expect(hiking && eagleLabel(hiking)).toContain('Swimming, Hiking or Cycling');
    expect(chess && eagleLabel(chess)).toBeNull();
  });

  it('searches names, summaries and categories', () => {
    expect(searchBadges('bugle').map((b) => b.id)).toContain('bugling');
    expect(searchBadges('Aquatics').length).toBeGreaterThan(5);
    expect(searchBadges('')).toHaveLength(138);
  });
});
