import { describe, expect, it } from 'vitest';
import { badge } from '../catalog';
import { STARTER_TEMPLATES } from '../starterTemplates';
import { addDays, applyTemplate, daysBetween, planToTemplateItems } from '../templates';

const template = {
  items: [
    { awardId: 'first-aid', startOffsetDays: 0, durationDays: 42 },
    { awardId: 'swimming', startOffsetDays: 42, durationDays: 28 },
  ],
};

describe('addDays', () => {
  it('crosses month ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
  });

  it('crosses year ends and leap days', () => {
    expect(addDays('2026-12-20', 20)).toBe('2027-01-09');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('measures days between dates', () => {
    expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2);
  });
});

describe('applyTemplate', () => {
  it('dates each badge from today plus its offset', () => {
    const result = applyTemplate({ template, current: [], today: '2026-12-01', mode: 'replace' });
    expect(result.items).toEqual([
      { awardId: 'first-aid', plannedStart: '2026-12-01', plannedEnd: '2027-01-12' },
      { awardId: 'swimming', plannedStart: '2027-01-12', plannedEnd: '2027-02-09' },
    ]);
  });

  it('replace drops the current plan', () => {
    const current = [{ awardId: 'chess' }];
    const result = applyTemplate({ template, current, today: '2026-06-01', mode: 'replace' });
    expect(result.items.map((i) => i.awardId)).toEqual(['first-aid', 'swimming']);
  });

  it('add keeps the current plan and does not duplicate badges', () => {
    const current = [{ awardId: 'swimming', plannedStart: '2026-05-01' }, { awardId: 'chess' }];
    const result = applyTemplate({ template, current, today: '2026-06-01', mode: 'add' });
    expect(result.items.map((i) => i.awardId)).toEqual(['swimming', 'chess', 'first-aid']);
    expect(result.items[0].plannedStart).toBe('2026-05-01');
    expect(result.skipped).toEqual(['swimming']);
  });

  it('skips badges the Scout already earned', () => {
    const result = applyTemplate({ template, current: [], today: '2026-06-01', mode: 'replace', earned: ['first-aid'] });
    expect(result.added.map((i) => i.awardId)).toEqual(['swimming']);
    expect(result.skipped).toEqual(['first-aid']);
  });
});

describe('planToTemplateItems', () => {
  it('measures offsets from the earliest start', () => {
    const items = planToTemplateItems([
      { awardId: 'swimming', plannedStart: '2026-03-01', plannedEnd: '2026-03-29' },
      { awardId: 'first-aid', plannedStart: '2026-01-15', plannedEnd: '2026-02-26' },
      { awardId: 'chess' },
    ]);
    expect(items).toEqual([
      { awardId: 'swimming', startOffsetDays: 45, durationDays: 28 },
      { awardId: 'first-aid', startOffsetDays: 0, durationDays: 42 },
      { awardId: 'chess', startOffsetDays: 0, durationDays: 28 },
    ]);
  });

  it('round-trips through apply', () => {
    const plan = [
      { awardId: 'first-aid', plannedStart: '2026-01-15', plannedEnd: '2026-02-26' },
      { awardId: 'swimming', plannedStart: '2026-03-01', plannedEnd: '2026-03-29' },
    ];
    const back = applyTemplate({
      template: { items: planToTemplateItems(plan) },
      current: [],
      today: '2026-01-15',
      mode: 'replace',
    });
    expect(back.items).toEqual(plan);
  });
});

describe('starter templates', () => {
  it('only use real badges and respect minimum tracking time', () => {
    const minDays: Record<string, number> = { 'personal-management': 91, 'personal-fitness': 84, 'family-life': 90 };
    for (const t of STARTER_TEMPLATES) {
      for (const item of t.items) {
        expect(badge(item.awardId), item.awardId).toBeDefined();
        expect(item.durationDays).toBeGreaterThanOrEqual(minDays[item.awardId] ?? 1);
      }
    }
  });
});
