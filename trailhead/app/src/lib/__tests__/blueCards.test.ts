import { describe, expect, it } from 'vitest';
import { plannedWithoutCard } from '../blueCards';
import type { BlueCard, PathItemDoc, Progress } from '../types';

const items: PathItemDoc[] = ['first-class', 'camping', 'cooking', 'swimming', 'camping'].map((awardId) => ({ awardId }));
const card = (awardId: string): BlueCard => ({ id: `s1_${awardId}`, scoutId: 's1', awardId, versionId: 'v', status: 'requested' });
const done = (awardId: string): Progress => ({ id: `s1_${awardId}`, scoutId: 's1', awardId, versionId: 'v', status: 'complete' });

describe('plannedWithoutCard', () => {
  it('lists planned merit badges with no card, once each, in plan order', () => {
    expect(plannedWithoutCard(items, [], [])).toEqual(['camping', 'cooking', 'swimming']);
  });

  it('leaves out ranks, badges that have a card, and badges already earned', () => {
    expect(plannedWithoutCard(items, [card('cooking')], [done('swimming')])).toEqual(['camping']);
    expect(plannedWithoutCard([{ awardId: 'custom-x' }], [], [])).toEqual([]);
  });
});
