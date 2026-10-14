import { describe, expect, it } from 'vitest';
import type { DraftResult } from '../api';
import { addDraftItems, draftItems } from '../draft';

const result: DraftResult = {
  items: [
    { awardId: 'swimming', plannedStart: '2026-11-01', plannedEnd: '2026-12-01' },
    { awardId: 'chess', plannedStart: null, plannedEnd: null },
  ],
  explanation: 'x',
  feasibility: { status: 'ok', issues: [], earliest_goal_date: null, next_steps: [] },
  repaired: false,
};

describe('draft helpers', () => {
  it('leaves out missing dates', () => {
    expect(draftItems(result)).toEqual([
      { awardId: 'swimming', plannedStart: '2026-11-01', plannedEnd: '2026-12-01' },
      { awardId: 'chess' },
    ]);
  });

  it('adds only badges the plan does not have', () => {
    const current = [{ awardId: 'chess', plannedStart: '2027-01-01', plannedEnd: '2027-02-01' }];
    const merged = addDraftItems(current, draftItems(result));
    expect(merged.map((i) => i.awardId)).toEqual(['chess', 'swimming']);
    expect(merged[0].plannedStart).toBe('2027-01-01');
  });
});
