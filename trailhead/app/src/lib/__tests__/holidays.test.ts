import { describe, expect, it } from 'vitest';
import { federalHolidays, holidayOn, longWeekend } from '../holidays';
import { addDays, compactRange, rangeText } from '../isoDate';

const byName = (year: number, name: string) => federalHolidays(year).find((h) => h.name === name)!;

describe('federalHolidays', () => {
  it('lists 11 holidays in order', () => {
    const list = federalHolidays(2026);
    expect(list).toHaveLength(11);
    expect([...list].sort((a, b) => a.date.localeCompare(b.date))).toEqual(list);
  });
  it('finds the floating holidays for 2026', () => {
    expect(byName(2026, 'Birthday of Martin Luther King Jr.').date).toBe('2026-01-19');
    expect(byName(2026, "Washington's Birthday").date).toBe('2026-02-16');
    expect(byName(2026, 'Memorial Day').date).toBe('2026-05-25');
    expect(byName(2026, 'Labor Day').date).toBe('2026-09-07');
    expect(byName(2026, 'Columbus Day').date).toBe('2026-10-12');
    expect(byName(2026, 'Thanksgiving Day').date).toBe('2026-11-26');
  });
  it('observes Saturday holidays on Friday', () => {
    const h = byName(2026, 'Independence Day');
    expect(h.actual).toBe('2026-07-04');
    expect(h.date).toBe('2026-07-03');
  });
  it('observes Sunday holidays on Monday', () => {
    expect(byName(2027, 'Christmas Day').date).toBe('2027-12-24');
    expect(byName(2022, 'Christmas Day').date).toBe('2022-12-26');
  });
  it("observes New Year's Day 2028 on Dec 31 2027", () => {
    const h = byName(2028, "New Year's Day");
    expect(h.actual).toBe('2028-01-01');
    expect(h.date).toBe('2027-12-31');
  });
});

describe('holidayOn', () => {
  it('finds an observed day, including across the new year', () => {
    expect(holidayOn('2026-07-03')?.name).toBe('Independence Day');
    expect(holidayOn('2026-07-04')).toBeUndefined();
    expect(holidayOn('2027-12-31')?.name).toBe("New Year's Day");
    expect(holidayOn('2026-03-03')).toBeUndefined();
  });
});

describe('longWeekend', () => {
  it('names the Labor Day weekend for Sat, Sun and Mon', () => {
    for (const d of ['2026-09-05', '2026-09-06', '2026-09-07']) {
      expect(longWeekend(d)).toBe('Labor Day weekend');
    }
    expect(longWeekend('2026-09-08')).toBeNull();
  });
  it('names a weekend with a Friday holiday', () => {
    expect(longWeekend('2026-07-03')).toBe('Fourth of July weekend');
    expect(longWeekend('2026-07-04')).toBe('Fourth of July weekend');
  });
  it('has no name for a Thursday holiday weekend', () => {
    expect(longWeekend('2026-11-28')).toBeNull();
  });
});

describe('date text', () => {
  it('formats ranges', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(rangeText('2026-11-07', '2026-11-08')).toBe('Sat Nov 7 – Sun Nov 8');
    expect(compactRange('2026-09-05', '2026-09-07')).toBe('Sep 5–7');
    expect(compactRange('2026-10-31', '2026-11-01')).toBe('Oct 31 – Nov 1');
  });
});

describe('every 2026 federal holiday', () => {
  it('falls on the observed day the federal calendar lists', () => {
    const days = Object.fromEntries(federalHolidays(2026).map((h) => [h.name, h.date]));
    expect(days).toEqual({
      "New Year's Day": '2026-01-01',
      'Birthday of Martin Luther King Jr.': '2026-01-19',
      "Washington's Birthday": '2026-02-16',
      'Memorial Day': '2026-05-25',
      Juneteenth: '2026-06-19',
      'Independence Day': '2026-07-03',
      'Labor Day': '2026-09-07',
      'Columbus Day': '2026-10-12',
      'Veterans Day': '2026-11-11',
      'Thanksgiving Day': '2026-11-26',
      'Christmas Day': '2026-12-25',
    });
  });
});
