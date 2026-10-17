import { describe, expect, it } from 'vitest';
import { GLOSSARY, HELP } from '../help';
import { HELP_MORE } from '../helpMore';
import { guidesToOpen, ROLE_GUIDES } from '../roleGuides';
import type { Role } from '../types';

const guide = (id: string) => {
  const found = ROLE_GUIDES.find((g) => g.id === id);
  if (!found) {
    throw new Error(`No guide ${id}`);
  }
  return found;
};
const text = (id: string) => {
  const g = guide(id);
  return [...g.sees, ...g.cannot, ...g.tasks.flatMap((t) => [t.task, ...t.steps])].join('\n').toLowerCase();
};
const EMOJI = /\p{Extended_Pictographic}/u;

describe('role guides: structure', () => {
  it('has unique ids and titles', () => {
    expect(new Set(ROLE_GUIDES.map((g) => g.id)).size).toBe(ROLE_GUIDES.length);
    expect(new Set(ROLE_GUIDES.map((g) => g.title)).size).toBe(ROLE_GUIDES.length);
  });

  it('says what each role can and cannot see, and has tasks with steps', () => {
    for (const g of ROLE_GUIDES) {
      expect(g.sees.length, g.id).toBeGreaterThan(0);
      expect(g.cannot.length, g.id).toBeGreaterThan(0);
      expect(g.tasks.length, g.id).toBeGreaterThan(0);
      for (const t of g.tasks) {
        expect(t.steps.length, `${g.id}: ${t.task}`).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate task names inside a guide', () => {
    for (const g of ROLE_GUIDES) {
      const names = g.tasks.map((t) => t.task);
      expect(new Set(names).size, g.id).toBe(names.length);
    }
  });

  it('uses plain text: no emoji, no empty lines, steps end like sentences', () => {
    for (const g of ROLE_GUIDES) {
      const lines = [g.title, ...g.sees, ...g.cannot, ...g.tasks.flatMap((t) => [t.task, ...t.steps])];
      for (const line of lines) {
        expect(line.trim(), g.id).not.toBe('');
        expect(EMOJI.test(line), line).toBe(false);
      }
      for (const line of [...g.sees, ...g.cannot, ...g.tasks.flatMap((t) => t.steps)]) {
        expect(/[.?")]$/.test(line), line).toBe(true);
      }
    }
  });

  it('keeps each step short enough to read at a glance', () => {
    for (const g of ROLE_GUIDES) {
      for (const line of [...g.sees, ...g.cannot, ...g.tasks.flatMap((t) => t.steps)]) {
        expect(line.length, line).toBeLessThanOrEqual(330);
      }
    }
  });

  it('writes titles and task names in sentence case', () => {
    for (const g of ROLE_GUIDES) {
      for (const t of g.tasks) {
        // Only the first word is capitalized, apart from names like Scoutbook and Scout.
        const words = t.task.split(' ').slice(1);
        const shouting = words.filter((w) => /^[A-Z][a-z]+$/.test(w) && !['Scout', 'Scouts', 'Scoutbook', 'Scoutmaster', 'Forthright'].includes(w));
        expect(shouting, t.task).toEqual([]);
      }
    }
  });
});

describe('role guides: treasurer', () => {
  const t = text('treasurer');
  it('covers accounts, fundraisers, charges, payments, statements and settling a Scout who leaves', () => {
    for (const word of ['fundraiser', 'post a charge', 'record a payment', 'reverse', 'download', 'settle the balance', 'general fund', 'sibling']) {
      expect(t, word).toContain(word);
    }
  });

  it('says card payments may not be available yet', () => {
    expect(t).toContain('may not be available yet');
  });

  it('says what the treasurer cannot see', () => {
    const g = guide('treasurer');
    expect(g.cannot.join(' ')).toMatch(/Roster/);
    expect(g.cannot.join(' ')).toMatch(/health notes/);
  });
});

describe('role guides: quartermaster', () => {
  const t = text('quartermaster');
  it('covers gear, check-out, requests and the repair log', () => {
    for (const word of ['add an item', 'check out', 'check in', 'request', 'repair log', 'overdue']) {
      expect(t, word).toContain(word);
    }
  });

  it('says the role grants nothing outside Equipment', () => {
    expect(guide('quartermaster').cannot.join(' ')).toMatch(/grants nothing outside Equipment/);
  });
});

describe('role guides: everyone and leaders', () => {
  it('explains sign-ups, waitlist, permission, health notes and fees for everyone', () => {
    const t = text('everyone');
    for (const word of ['waitlist', 'permission', 'health note', 'fee', 'calendar', 'install forthright', 'add to home screen', 'more than one role']) {
      expect(t, word).toContain(word);
    }
  });

  it('gives leaders the sign-up, patrol, activity, announcement, website and document tasks', () => {
    const t = text('leader');
    for (const word of ['turn on sign-ups', 'waitlist', 'patrol', 'activity log', 'newsletter', 'website', 'documents', 'public website', 'treasurer or quartermaster']) {
      expect(t, word).toContain(word);
    }
  });

  it('keeps leaders away from money unless they are the Scoutmaster or advancement chair', () => {
    expect(guide('leader').cannot.join(' ')).toMatch(/Scout accounts, unless you are also the Scoutmaster, advancement chair or treasurer/);
  });
});

describe('which guides open', () => {
  const holds = (...roles: Role[]) => (r: Role) => roles.includes(r);
  it('opens the treasurer and quartermaster guides for those roles', () => {
    expect(guidesToOpen(false, holds('treasurer'))).toEqual(['treasurer']);
    expect(guidesToOpen(false, holds('quartermaster'))).toEqual(['quartermaster']);
  });

  it('opens one guide for each role a person holds', () => {
    expect(guidesToOpen(true, holds('leader', 'scoutmaster', 'parent', 'treasurer'))).toEqual(['leader', 'treasurer', 'parent']);
  });

  it('opens nothing for someone with no role', () => {
    expect(guidesToOpen(false, holds())).toEqual([]);
  });

  it('only names guides that exist', () => {
    const ids = new Set(ROLE_GUIDES.map((g) => g.id));
    const all = guidesToOpen(true, () => true);
    for (const id of all) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe('more help copy', () => {
  it('has a title and body for every new entry, and merges them into HELP', () => {
    for (const [key, entry] of Object.entries(HELP_MORE)) {
      expect(entry.title, key).not.toBe('');
      expect(entry.body.length, key).toBeGreaterThan(20);
      expect(EMOJI.test(entry.body), key).toBe(false);
      expect(HELP[key as keyof typeof HELP], key).toBeDefined();
    }
  });

  it('explains card payments as possibly unavailable', () => {
    expect(HELP_MORE.cardPayments.body).toMatch(/may not be available yet/);
  });

  it('adds the new words to the glossary, in alphabetical order', () => {
    const terms = GLOSSARY.map((g) => g.term);
    for (const t of ['Treasurer', 'Quartermaster', 'Waitlist', 'Scout account']) {
      expect(terms).toContain(t);
    }
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b)));
  });

  it('mentions the new roles in "Who can do what"', () => {
    expect(HELP.roles.body).toMatch(/treasurer/);
    expect(HELP.roles.body).toMatch(/quartermaster/);
  });
});
