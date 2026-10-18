import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '../equipment';
import { CONDITION_TIP, LATE_TIP, REQUEST_TIP, STOCK_TIP } from '../equipmentTips';

const STOCK_LABELS = ['On the shelf', 'Out', '3 of 4 on the shelf', '0 of 4 on the shelf'];
const CONDITION_LABELS = CONDITIONS.map(([, label]) => label);
const REQUEST_LABELS = ['Waiting', 'Approved', 'Declined'];
const LATE_LABELS = ['1 day overdue', '12 days overdue'];

/** Words on buttons and text beside the pills, which tests look up by substring. */
const NEARBY = {
  stock: ['only items on the shelf', 'check out', 'checked out', 'needs repair', 'retired'],
  condition: ['good', 'check out', 'checked out', 'on the shelf', 'only items'],
  request: ['approve', 'decline', 'waiting'],
  late: ['check in', 'due ', 'overdue', 'checked out'],
};

function check(tips: string[], labels: string[], nearby: string[]) {
  for (const tip of tips) {
    expect(tip.length).toBeGreaterThan(20);
    const lower = tip.toLowerCase();
    for (const word of [...labels, ...nearby]) {
      expect(lower, `"${tip}" repeats "${word}"`).not.toContain(word.toLowerCase());
    }
  }
}

describe('equipment explanations', () => {
  it('cover every stock tone, condition and request status', () => {
    expect(Object.keys(STOCK_TIP).sort()).toEqual(['bad', 'good', 'warn']);
    expect(Object.keys(CONDITION_TIP).sort()).toEqual(['needs_repair', 'retired']);
    expect(Object.keys(REQUEST_TIP).sort()).toEqual(['approved', 'declined', 'pending']);
  });
  it('never repeat a pill or a nearby label', () => {
    check(Object.values(STOCK_TIP), STOCK_LABELS, NEARBY.stock);
    check(Object.values(CONDITION_TIP), CONDITION_LABELS, NEARBY.condition);
    check(Object.values(REQUEST_TIP), REQUEST_LABELS, NEARBY.request);
    check([LATE_TIP], LATE_LABELS, NEARBY.late);
  });
});
