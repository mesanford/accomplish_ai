import { describe, expect, it } from 'vitest';
import { IDEAS, ideasFor } from '../ideaStarters';
import type { Brief } from '../planBrief';
import { answersFrom, briefFrom, stepsFor } from '../tripQuestions';

describe('stepsFor', () => {
  it('skips sleeping for a day trip or service, and must-haves for service', () => {
    const keys = (kind: Parameters<typeof stepsFor>[0], length?: string) =>
      stepsFor(kind, length ? { length: [length] } : {}).map((s) => s.key);
    expect(keys('campout')).toEqual(['length', 'season', 'drive', 'interests', 'lodging', 'mustHaves', 'budget']);
    expect(keys('campout', 'day')).not.toContain('lodging');
    expect(keys('service')).toEqual(['length', 'season', 'drive', 'interests', 'budget']);
  });
});

describe('briefFrom and answersFrom', () => {
  it('turns answers into a brief and back', () => {
    const brief = briefFrom(
      { length: ['weekend'], season: ['fall'], drive: ['120'], interests: ['paddling'], budget: ['5000'] },
      null,
    );
    expect(brief).toMatchObject({ tripLength: 'weekend', season: 'fall', maxDriveMinutes: 120, budgetCents: 5000 });
    expect(brief.interests).toEqual(['paddling']);
    expect(answersFrom(brief).drive).toEqual(['120']);
  });

  it('treats "farther" and "not sure" as no limit, and keeps what was not asked', () => {
    const prior: Brief = {
      maxDriveMinutes: 90,
      budgetCents: 3000,
      lodging: 'cabins',
      mustHaves: ['water'],
      notes: 'First campout',
      tripLength: 'weekend',
      season: null,
      interests: [],
    };
    const brief = briefFrom({ drive: ['any'], budget: ['unsure'] }, prior);
    expect(brief.maxDriveMinutes).toBeNull();
    expect(brief.budgetCents).toBeNull();
    expect(brief).toMatchObject({ lodging: 'cabins', mustHaves: ['water'], notes: 'First campout' });
  });
});

describe('ideasFor', () => {
  it('picks ideas by interest and trip length', () => {
    const ideas = ideasFor('campout', ['paddling', 'fishing'], 'weekend');
    expect(ideas.map((i) => i.interest)).toEqual(['paddling', 'fishing']);
    expect(ideasFor('campout', ['climbing'], 'weekend')).toEqual([]);
  });

  it('offers only service ideas for a service project, and no service ideas otherwise without interests', () => {
    expect(ideasFor('service', [], null).every((i) => i.interest === 'service')).toBe(true);
    expect(ideasFor('campout', [], 'weekend').some((i) => i.interest === 'service')).toBe(false);
    expect(IDEAS.length).toBeGreaterThan(10);
  });
});
