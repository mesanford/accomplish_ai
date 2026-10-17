import { describe, expect, it } from 'vitest';
import {
  type ActivityEntry,
  campingBadgeNights,
  eagleProjectHours,
  inRange,
  presetRange,
  serviceSteps,
  sumEntries,
  troopReport,
} from '../activity';
import { reportCsv, reportFileName } from '../activityCsv';

const e = (id: string, over: Partial<ActivityEntry>): ActivityEntry => ({ id, scoutId: 's1', date: '2026-03-01', ...over });

describe('inRange', () => {
  it('includes both end dates and nothing outside them', () => {
    const range = { from: '2026-01-01', to: '2026-12-31' };
    expect(inRange('2026-01-01', range)).toBe(true);
    expect(inRange('2026-12-31', range)).toBe(true);
    expect(inRange('2025-12-31', range)).toBe(false);
    expect(inRange('2027-01-01', range)).toBe(false);
  });

  it('accepts open ends and leaves out undated entries only when a range is set', () => {
    expect(inRange('2020-05-05', { from: '2020-01-01' })).toBe(true);
    expect(inRange('2020-05-05', { to: '2019-12-31' })).toBe(false);
    expect(inRange(undefined, {})).toBe(true);
    expect(inRange(undefined, { from: '2020-01-01' })).toBe(false);
  });
});

describe('presetRange', () => {
  const now = new Date(2026, 9, 17);
  it('uses calendar years', () => {
    expect(presetRange('year', now)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('lastYear', now)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(presetRange('all', now)).toEqual({});
  });
});

describe('sumEntries', () => {
  const entries = [
    e('a', { nights: 2, miles: 3, date: '2026-02-01' }),
    e('b', { serviceHours: 1.5, date: '2026-06-01' }),
    e('c', { serviceHours: 1.25, date: '2026-07-01' }),
    e('d', { nights: 5, status: 'pending' }),
    e('f', { nights: 5, status: 'rejected' }),
    e('g', { nights: 1, date: '2025-11-01', status: 'approved' }),
  ];

  it('adds approved credits only, and old credits with no status count', () => {
    expect(sumEntries(entries)).toEqual({ nights: 3, serviceHours: 2.75, miles: 3, campouts: 2 });
  });

  it('limits the sum to a date range', () => {
    expect(sumEntries(entries, { from: '2026-01-01', to: '2026-06-30' })).toEqual({
      nights: 2,
      serviceHours: 1.5,
      miles: 3,
      campouts: 1,
    });
  });
});

describe('campingBadgeNights', () => {
  it('counts ordinary campouts in full', () => {
    expect(campingBadgeNights([e('a', { nights: 2 }), e('b', { nights: 3 })])).toEqual({ counted: 5, raw: 5, notCounted: 0 });
  });

  it('counts a long-term camp as at most 6 nights', () => {
    const c = campingBadgeNights([e('a', { nights: 2 }), e('b', { nights: 9 })]);
    expect(c).toEqual({ counted: 8, raw: 11, notCounted: 3 });
  });

  it('counts only one long-term camp', () => {
    const c = campingBadgeNights([e('a', { nights: 6 }), e('b', { nights: 7 }), e('c', { nights: 4 })]);
    expect(c).toEqual({ counted: 10, raw: 17, notCounted: 7 });
  });

  it('treats 5 nights as ordinary and ignores pending entries', () => {
    expect(campingBadgeNights([e('a', { nights: 5 }), e('b', { nights: 8, status: 'pending' })]).counted).toBe(5);
  });
});

describe('serviceSteps', () => {
  it('spreads hours across Tenderfoot, Second Class and First Class in turn', () => {
    const steps = serviceSteps([e('a', { serviceHours: 4 })]);
    expect(steps.map((s) => [s.label, s.have, s.needed])).toEqual([
      ['Tenderfoot 7b', 1, 1],
      ['Second Class 8e', 2, 2],
      ['First Class 9d', 1, 3],
      ['Star 4', 0, 6],
      ['Life 4', 0, 6],
    ]);
  });

  it('counts Star hours done on or after the First Class date', () => {
    const entries = [e('a', { serviceHours: 10, date: '2026-01-01' }), e('b', { serviceHours: 4, date: '2026-05-01' })];
    const steps = serviceSteps(entries, { 'first-class': '2026-04-01' });
    const star = steps.find((s) => s.label === 'Star 4');
    expect(star).toMatchObject({ have: 4, after: 'since First Class' });
    expect(steps.find((s) => s.label === 'Life 4')?.have).toBe(0);
  });
});

describe('eagleProjectHours', () => {
  it('adds approved Eagle project hours only', () => {
    const entries = [
      e('a', { serviceHours: 40, eagleProject: true }),
      e('b', { serviceHours: 10 }),
      e('c', { serviceHours: 5, eagleProject: true, status: 'pending' }),
    ];
    expect(eagleProjectHours(entries)).toBe(40);
  });
});

describe('troopReport and CSV', () => {
  const scouts = [
    { id: 's1', name: 'Sam', patrolId: 'p1' },
    { id: 's2', name: 'Ava', patrolId: 'p1' },
    { id: 's3', name: '=Evil', patrolId: undefined },
  ];
  const entries = [
    e('a', { scoutId: 's1', nights: 2, serviceHours: 3, date: '2026-04-01' }),
    e('b', { scoutId: 's2', serviceHours: 2, date: '2026-04-01' }),
    e('c', { scoutId: 's3', miles: 5, date: '2025-04-01' }),
    e('d', { scoutId: 'gone', nights: 9, date: '2026-04-01' }),
  ];
  const names = { p1: 'Eagles' };

  it('totals each Scout and each patrol, with Scouts without a patrol last', () => {
    const r = troopReport(entries, scouts, names, { from: '2026-01-01', to: '2026-12-31' });
    expect(r.rows.map((x) => [x.name, x.nights, x.serviceHours, x.miles])).toEqual([
      ['=Evil', 0, 0, 0],
      ['Ava', 0, 2, 0],
      ['Sam', 2, 3, 0],
    ]);
    expect(r.patrols.map((p) => [p.name, p.scouts, p.nights, p.serviceHours])).toEqual([
      ['Eagles', 2, 2, 5],
      ['No patrol', 1, 0, 0],
    ]);
    expect(r.total).toEqual({ nights: 2, serviceHours: 5, miles: 0, campouts: 1 });
    expect(r.scoutsServing).toBe(2);
  });

  it('writes a CSV with a header, one row per Scout and a total, guarding spreadsheet formulas', () => {
    const csv = reportCsv(troopReport(entries, scouts, names, {}), names);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Scout,Patrol,Overnight campouts,Nights camped,Service hours,Miles hiked');
    expect(lines).toContain("'=Evil,,0,0,0,5");
    expect(lines).toContain('Sam,Eagles,1,2,3,0');
    expect(lines.at(-1)).toBe('Troop total,,1,2,5,5');
  });

  it('quotes names with commas and names the file for its dates', () => {
    const csv = reportCsv(troopReport([], [{ id: 'x', name: 'Lee, Sam' }], {}, {}), {});
    expect(csv).toContain('"Lee, Sam"');
    expect(reportFileName({ from: '2026-01-01', to: '2026-12-31' })).toBe('troop-activity-2026-01-01-to-2026-12-31.csv');
    expect(reportFileName({})).toBe('troop-activity-all-time.csv');
  });
});
