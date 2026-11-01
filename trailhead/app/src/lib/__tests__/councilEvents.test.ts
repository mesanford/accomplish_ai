import { describe, expect, it } from 'vitest';
import { type CouncilEvent, councilEventsIn, councilKey } from '../councilEvents';
import { titleFromParams } from '../planDefaults';

const ev = (title: string, start: string, end: string | null = null): CouncilEvent => ({
  title,
  start,
  end,
  place: '',
  url: null,
  repeats: false,
});

describe('council calendars', () => {
  it('match troops of the same council the way the server does', () => {
    expect(councilKey('Bay-Lakes Council, BSA')).toBe('bay-lakes');
    expect(councilKey('Bay Lakes')).toBe('bay-lakes');
    expect(councilKey('Council')).toBeNull();
  });

  it('finds the council events that touch a weekend', () => {
    const events = [ev('Camporee', '2026-11-13', '2026-11-15'), ev('Roundtable', '2026-11-05'), ev('MBU', '2026-11-14')];
    expect(councilEventsIn(events, '2026-11-14', '2026-11-15').map((e) => e.title)).toEqual(['Camporee', 'MBU']);
    expect(councilEventsIn(events, '2026-11-07', '2026-11-08')).toEqual([]);
  });

  it('carries a council event name into a new plan', () => {
    expect(titleFromParams(new URLSearchParams('title=Fall%20Camporee'))).toBe('Fall Camporee');
    expect(titleFromParams(new URLSearchParams(''))).toBe('');
  });
});
