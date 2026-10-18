import { describe, expect, it } from 'vitest';
import { LEAD_STATUSES } from '../leads';
import { LEAD_STATUS_HINT, LEAD_TIP } from '../leadTips';

/** Labels and buttons on the same card, which tests look up by substring. */
const NEARBY = [
  'status',
  'notes for leaders',
  'invite link',
  'create invite link',
  'make a new invite link',
  'copy link',
  'delete',
  'keep',
  'asked on',
  'scout age',
  'scout grade',
  'recruiting',
  'tell me more',
];

describe('recruiting status explanations', () => {
  it('explains every status', () => {
    expect(Object.keys(LEAD_TIP).sort()).toEqual(LEAD_STATUSES.map(([value]) => value).sort());
  });

  it('never repeats a status label or a nearby label', () => {
    const labels = LEAD_STATUSES.map(([, label]) => label);
    for (const tip of [...Object.values(LEAD_TIP), LEAD_STATUS_HINT]) {
      expect(tip.length).toBeGreaterThan(20);
      const lower = tip.toLowerCase();
      for (const word of [...labels, ...NEARBY]) {
        expect(lower, `"${tip}" contains "${word}"`).not.toContain(word.toLowerCase());
      }
    }
  });

  it('says which changes happen by themselves', () => {
    expect(LEAD_TIP.invited).toContain('when you make the link');
    expect(LEAD_TIP.joined).toContain('when they join');
    expect(LEAD_STATUS_HINT).toContain('change on their own');
  });
});
