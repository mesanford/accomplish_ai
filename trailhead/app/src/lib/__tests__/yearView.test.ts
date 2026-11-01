import { describe, expect, it } from 'vitest';
import { federalHolidays } from '../holidays';
import { coreWithDates, datesFromParams } from '../planDefaults';
import type { EventPlan } from '../plans';
import type { TroopEvent } from '../types';
import { buildDays, buildWeekends } from '../yearView';

const ev = (o: Partial<TroopEvent>): TroopEvent => ({ id: 'e1', title: 'Fall campout', start: '2026-10-17', ...o }) as TroopEvent;
const plan = (o: Partial<EventPlan> & { start?: string; end?: string }): EventPlan =>
  ({
    id: 'p1',
    title: 'Klondike prep',
    status: 'draft',
    targetWindow: { from: null, to: null },
    segments: [{ start: o.start ?? null, endDate: o.end ?? null }],
    ...o,
  }) as unknown as EventPlan;

const hol = federalHolidays(2026);
const build = (events: TroopEvent[], plans: EventPlan[]) => {
  const days = buildDays(events, plans, '2026-09-01', '2026-11-30', hol);
  return { days, weekends: buildWeekends(days, '2026-09-01', '2026-11-30', hol) };
};
const weekend = (w: ReturnType<typeof build>['weekends'], sat: string) => w.find((x) => x.sat === sat)!;

describe('buildDays and buildWeekends', () => {
  it('books every day of a multi-day event', () => {
    const { days, weekends } = build([ev({ endDate: '2026-10-18' })], []);
    expect(days.get('2026-10-17')?.status).toBe('booked');
    expect(days.get('2026-10-18')?.status).toBe('booked');
    expect(days.get('2026-10-19')?.status).toBeNull();
    expect(weekend(weekends, '2026-10-17').status).toBe('booked');
  });
  it('ignores cancelled events', () => {
    const { weekends } = build([ev({ cancelled: true })], []);
    expect(weekend(weekends, '2026-10-17').status).toBe('open');
  });
  it('marks draft and decided plans as maybe, by segment dates then window', () => {
    const a = plan({ start: '2026-11-14', end: '2026-11-15' });
    const b = plan({ id: 'p2', title: 'Hike', status: 'decided', targetWindow: { from: '2026-10-24', to: '2026-10-25' } });
    const { weekends } = build([], [a, b]);
    expect(weekend(weekends, '2026-11-14')).toMatchObject({ status: 'maybe', entries: [{ kind: 'maybe', label: 'Klondike prep', planId: 'p1' }] });
    expect(weekend(weekends, '2026-10-24').status).toBe('maybe');
  });
  it('ignores published, cancelled and closed plans', () => {
    const plans = (['published', 'cancelled', 'closed'] as const).map((s, i) => plan({ id: `x${i}`, status: s, start: '2026-11-14' }));
    expect(weekend(build([], plans).weekends, '2026-11-14').status).toBe('open');
  });
  it('lets booked win over maybe', () => {
    const { weekends } = build([ev({ start: '2026-11-14' })], [plan({ start: '2026-11-14', end: '2026-11-15' })]);
    expect(weekend(weekends, '2026-11-14').status).toBe('booked');
  });
  it('names holidays and long weekends', () => {
    const { days, weekends } = build([], []);
    expect(days.get('2026-09-07')?.holiday).toBe('Labor Day');
    expect(weekend(weekends, '2026-09-05')).toMatchObject({ status: 'open', holiday: 'Labor Day weekend' });
    expect(weekend(weekends, '2026-11-07').holiday).toBeUndefined();
  });
});

describe('plan defaults', () => {
  it('builds a valid core with dates', () => {
    const c = coreWithDates('Hike', 'highAdventure', '2026-11-07', '2026-11-08');
    expect(c.segments[0]).toMatchObject({ start: '2026-11-07', endDate: '2026-11-08', logKind: 'campout', place: '' });
    expect(coreWithDates('x', 'service', '2026-11-07', '2026-11-07').segments[0].endDate).toBeNull();
  });
  it('reads search params', () => {
    expect(datesFromParams(new URLSearchParams('start=2026-11-07&end=2026-11-08'))).toEqual({ start: '2026-11-07', end: '2026-11-08' });
    expect(datesFromParams(new URLSearchParams('start=oops'))).toBeNull();
  });
});
