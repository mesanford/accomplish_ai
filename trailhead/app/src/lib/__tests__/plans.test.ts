import type { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { badLink, centsOrNull, describeField, groupPlans, intOrNull, linksFromText, minutesText, money, nextMilestone, plannable } from '../planForms';
import { type EventPlan, isOverdue, isStale, type Milestone, safeLink, sortMilestones } from '../plans';
import { availabilityChanged } from '../plansOptions';
import type { TroopEvent } from '../types';

const now = new Date('2026-06-01T12:00:00Z');
const at = (daysAgo: number) => ({ toDate: () => new Date(now.getTime() - daysAgo * 86_400_000) }) as unknown as Timestamp;
const ms = (id: string, dueOn: string | null, order: number, done = false): Milestone => ({
  id,
  title: id,
  anchor: 'start',
  offsetDays: 0,
  fixedOn: null,
  ownerRole: null,
  order,
  dueOn,
  done: done ? { byMemberId: null } : null,
});

describe('safeLink', () => {
  it('keeps http and https links', () => {
    expect(safeLink(' https://example.com/a ')).toBe('https://example.com/a');
    expect(safeLink('http://example.com')).toBe('http://example.com/');
  });
  it('rejects script, data and other schemes, and text that is not a URL', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeLink('data:text/html,<b>x</b>')).toBeNull();
    expect(safeLink('ftp://example.com')).toBeNull();
    expect(safeLink('not a url')).toBeNull();
  });
});

describe('isStale', () => {
  it('is stale only after 30 days', () => {
    expect(isStale(at(30), now)).toBe(false);
    expect(isStale(at(31), now)).toBe(true);
    expect(isStale(at(40), now)).toBe(true);
  });
  it('is not stale while the server time is pending', () => {
    expect(isStale(undefined, now)).toBe(false);
    expect(isStale(null, now)).toBe(false);
  });
});

describe('sortMilestones and isOverdue', () => {
  it('sorts by date, then order, with undated last', () => {
    const list = [ms('c', null, 0), ms('b', '2026-06-10', 2), ms('a', '2026-06-10', 1), ms('d', '2026-05-01', 9)];
    expect(sortMilestones(list).map((m) => m.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('does not change the list it is given', () => {
    const list = [ms('b', '2026-06-10', 0), ms('a', '2026-05-10', 1)];
    sortMilestones(list);
    expect(list.map((m) => m.id)).toEqual(['b', 'a']);
  });
  it('flags an undone milestone past its date', () => {
    expect(isOverdue(ms('a', '2026-05-31', 0), '2026-06-01')).toBe(true);
    expect(isOverdue(ms('a', '2026-06-01', 0), '2026-06-01')).toBe(false);
    expect(isOverdue(ms('a', '2026-05-31', 0, true), '2026-06-01')).toBe(false);
    expect(isOverdue(ms('a', null, 0), '2026-06-01')).toBe(false);
  });
  it('finds the next undone milestone', () => {
    expect(nextMilestone([ms('a', '2026-05-01', 0, true), ms('b', '2026-06-01', 1)])?.id).toBe('b');
    expect(nextMilestone([ms('a', '2026-05-01', 0, true)])).toBeNull();
  });
});

describe('form helpers', () => {
  it('reads whole numbers', () => {
    expect(intOrNull('', 10)).toBeNull();
    expect(intOrNull(' 7 ', 10)).toBe(7);
    expect(intOrNull('11', 10)).toBeUndefined();
    expect(intOrNull('-1', 10)).toBeUndefined();
    expect(intOrNull('2.5', 10)).toBeUndefined();
  });
  it('reads dollars as cents', () => {
    expect(centsOrNull('')).toBeNull();
    expect(centsOrNull('12.50')).toBe(1250);
    expect(centsOrNull('abc')).toBeUndefined();
  });
  it('splits links by line and finds unsafe ones', () => {
    const links = linksFromText('https://a.com\n\n  javascript:x \n');
    expect(links).toEqual(['https://a.com', 'javascript:x']);
    expect(badLink(links)).toBe('javascript:x');
    expect(badLink(['https://a.com'])).toBeNull();
  });
  it('words money, minutes and differences', () => {
    expect(money(2500)).toBe('$25');
    expect(money(1250)).toBe('$12.50');
    expect(money(null)).toBe('Not set');
    expect(minutesText(90)).toBe('1 hr 30 min');
    expect(minutesText(45)).toBe('45 min');
    expect(describeField('feeCents', 3000)).toBe('$30');
    expect(describeField('place', null)).toBe('Not set');
    expect(describeField('signups', { enabled: true, capacity: 20, deadline: null })).toBe('On, 20 spots');
  });
});

describe('availabilityChanged', () => {
  const old = { state: 'available' as const, byMemberId: 'm1', at: at(1), note: 'Called Sam' };
  it('is false when the status and note are the same', () => {
    expect(availabilityChanged(old, 'available', 'Called Sam')).toBe(false);
    expect(availabilityChanged({ ...old, note: undefined }, 'available', '  ')).toBe(false);
  });
  it('is true when either changes', () => {
    expect(availabilityChanged(old, 'held', 'Called Sam')).toBe(true);
    expect(availabilityChanged(old, 'available', 'Called Pat')).toBe(true);
  });
});

describe('plans lists', () => {
  const plan = (id: string, status: EventPlan['status'], start: string | null) =>
    ({ id, status, title: id, segments: [{ id: 's1', start }], targetWindow: { from: null, to: null } }) as unknown as EventPlan;
  it('groups by status in order, soonest first, leaving out empty groups', () => {
    const groups = groupPlans([plan('b', 'draft', '2026-08-01'), plan('a', 'draft', '2026-07-01'), plan('c', 'closed', null)]);
    expect(groups.map(([s, l]) => [s, l.map((p) => p.id)])).toEqual([
      ['draft', ['a', 'b']],
      ['closed', ['c']],
    ]);
  });
  it('offers events without a plan from 60 days ago on', () => {
    const ev = (id: string, start: string, planId?: string) => ({ id, start, planId, title: id }) as TroopEvent;
    const out = plannable([ev('old', '2026-01-01'), ev('recent', '2026-05-20'), ev('planned', '2026-07-01', 'p'), ev('soon', '2026-07-02')], '2026-06-01');
    expect(out.map((e) => e.id)).toEqual(['recent', 'soon']);
  });
});
