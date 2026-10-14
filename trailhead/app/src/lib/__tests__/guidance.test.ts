import { describe, expect, it } from 'vitest';
import { GLOSSARY, HELP } from '../help';
import { ROLE_GUIDES } from '../roleGuides';
import { leaderChecklist, parentChecklist, progress, readHidden, writeHidden } from '../guidance';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('hidden guidance', () => {
  it('remembers a hide and a show', () => {
    const s = memoryStorage();
    expect(readHidden('guide.roster', s)).toBe(false);
    writeHidden('guide.roster', true, s);
    expect(readHidden('guide.roster', s)).toBe(true);
    writeHidden('guide.roster', false, s);
    expect(readHidden('guide.roster', s)).toBe(false);
  });

  it('never throws when storage is blocked', () => {
    expect(readHidden('x', throwing)).toBe(false);
    expect(() => writeHidden('x', true, throwing)).not.toThrow();
  });
});

describe('getting started', () => {
  const empty = { scouts: 0, parents: 0, counselors: 0, events: 0, published: false, paths: 0 };

  it('starts with nothing done for a new troop', () => {
    const items = leaderChecklist('/t/a', empty);
    expect(items).toHaveLength(6);
    expect(progress(items)).toEqual({ done: 0, total: 6, complete: false });
  });

  it('ticks items off from real data', () => {
    const items = leaderChecklist('/t/a', { ...empty, scouts: 3, events: 1, published: true });
    expect(items.filter((i) => i.done).map((i) => i.id)).toEqual(['scouts', 'events', 'website']);
    expect(progress(items).complete).toBe(false);
  });

  it('is complete only when every step is done', () => {
    const all = { scouts: 1, parents: 1, counselors: 1, events: 1, published: true, paths: 1 };
    expect(progress(leaderChecklist('/t/a', all)).complete).toBe(true);
  });

  it('has a shorter parent version', () => {
    const items = parentChecklist('/t/a', { scouts: 1, paths: 0, blueCards: 0 });
    expect(items.map((i) => i.done)).toEqual([true, false, false]);
    expect(progress(parentChecklist('/t/a', { scouts: 1, paths: 1, blueCards: 2 })).complete).toBe(true);
  });
});

describe('help copy', () => {
  it('has a title and body for every entry, with only scouting.org links', () => {
    for (const [key, entry] of Object.entries(HELP) as [string, { title: string; body: string; learnMore?: string }][]) {
      expect(entry.title, key).not.toBe('');
      expect(entry.body.length, key).toBeGreaterThan(20);
      if (entry.learnMore) {
        expect(new URL(entry.learnMore).hostname, key).toMatch(/(^|\.)scouting\.org$/);
      }
    }
  });

  it('covers the jargon the app uses', () => {
    const terms = GLOSSARY.map((g) => g.term.toLowerCase());
    for (const t of ['blue card', 'board of review', 'eagle-required', 'partials', 'ypt', 'position of responsibility']) {
      expect(terms).toContain(t);
    }
  });

  it('has a guide for each role', () => {
    expect(ROLE_GUIDES.map((g) => g.id)).toEqual(['leader', 'parent', 'scout', 'counselor']);
  });
});
