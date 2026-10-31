import { describe, expect, it } from 'vitest';
import { type Brief, briefProblems, toAsk } from '../planBrief';
import { pastTrips } from '../planPast';
import type { TroopEvent } from '../types';

const brief: Brief = { maxDriveMinutes: 120, budgetCents: 4000, lodging: 'tents', mustHaves: ['water', 'toilets'], notes: '' };

describe('briefProblems', () => {
  it('names what does not fit, in words', () => {
    const option = { costCents: 5000, driveMinutes: 150, capacity: 10, amenities: ['water' as const] };
    expect(briefProblems(option, brief, 14)).toEqual([
      'Over budget: $50 a Scout, budget $40',
      'Too far: 2 hr 30 min, limit 2 hr',
      'Too small: room for 10, about 14 going',
      'Missing: toilets',
    ]);
  });

  it('does not count unknown values against an option, and has nothing to say without a brief', () => {
    expect(briefProblems({}, brief, 14)).toEqual([]);
    expect(briefProblems({ costCents: 9999 }, null, 14)).toEqual([]);
    expect(toAsk({}, brief)).toEqual(['water', 'toilets']);
    expect(toAsk({ amenities: ['water'] }, brief)).toEqual([]);
  });
});

describe('pastTrips', () => {
  const ev = (over: Partial<TroopEvent>): TroopEvent => ({ id: 'x', title: 'Campout', start: '2026-05-01', ...over });
  const events = [
    ev({ id: '1', place: 'Pine Lake', start: '2026-05-01', logKind: 'campout' }),
    ev({ id: '2', place: 'pine lake', start: '2025-09-12', logKind: 'campout', title: 'Fall campout' }),
    ev({ id: '3', place: 'Cedar Ridge', start: '2026-03-01', logKind: 'campout', cancelled: true }),
    ev({ id: '4', place: 'Food bank', start: '2026-02-01', logKind: 'service' }),
    ev({ id: '5', place: 'Camp Next', start: '2026-12-01', logKind: 'campout' }),
  ];

  it('lists past trips of the same kind once per place, most recent first', () => {
    expect(pastTrips(events, 'campout', '2026-10-31', [])).toEqual([
      { name: 'Pine Lake', lastDate: '2026-05-01', lastTitle: 'Campout', times: 2 },
    ]);
    expect(pastTrips(events, 'service', '2026-10-31', []).map((t) => t.name)).toEqual(['Food bank']);
    expect(pastTrips(events, 'other', '2026-10-31', []).map((t) => t.name)).toEqual(['Pine Lake', 'Food bank']);
  });

  it('leaves out places already on the plan', () => {
    expect(pastTrips(events, 'campout', '2026-10-31', ['PINE LAKE '])).toEqual([]);
  });
});
