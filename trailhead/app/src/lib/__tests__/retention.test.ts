import { describe, expect, it } from 'vitest';
import { activityDue, addMonths, rememberActivity, scoutDeletionDate } from '../retention';

const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('addMonths', () => {
  it('keeps the day when it exists', () => {
    expect(ymd(addMonths(new Date(2026, 0, 15), 12))).toEqual([2027, 1, 15]);
    expect(ymd(addMonths(new Date(2026, 10, 30), 2))).toEqual([2027, 1, 30]);
  });

  it('moves to the 1st of the next month when the day is missing, like the server', () => {
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toEqual([2026, 3, 1]);
    expect(ymd(addMonths(new Date(2024, 1, 29), 12))).toEqual([2025, 3, 1]);
    expect(ymd(scoutDeletionDate(new Date(2024, 1, 29)))).toEqual([2025, 3, 1]);
    expect(ymd(scoutDeletionDate(new Date(2025, 9, 14)))).toEqual([2026, 10, 14]);
  });
});

describe('activityDue', () => {
  it('asks once a day per troop', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(activityDue('t1', '2026-10-14', storage)).toBe(true);
    rememberActivity('t1', '2026-10-14', storage);
    expect(activityDue('t1', '2026-10-14', storage)).toBe(false);
    expect(activityDue('t2', '2026-10-14', storage)).toBe(true);
    expect(activityDue('t1', '2026-10-15', storage)).toBe(true);
  });

  it('still asks when storage is missing or throws', () => {
    expect(activityDue('t1', '2026-10-14', null)).toBe(true);
    const broken = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    expect(activityDue('t1', '2026-10-14', broken)).toBe(true);
    expect(() => rememberActivity('t1', '2026-10-14', broken)).not.toThrow();
  });
});
