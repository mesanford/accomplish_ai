import { describe, expect, it } from 'vitest';
import { ARCHIVED_AWARD_PAGE_TIP, ARCHIVED_AWARD_TIP, ARCHIVED_TEMPLATE_TIP } from '../archiveTips';

/** Labels shown near the pills; tests look them up by substring, so no tip may contain them. */
const NEARBY = ['archived', 'archive', 'restore', 'show archived', 'edit', 'version', 'new award', 'all troop awards'];

describe('archive tips', () => {
  it.each([
    ['template', ARCHIVED_TEMPLATE_TIP],
    ['award', ARCHIVED_AWARD_TIP],
    ['award page', ARCHIVED_AWARD_PAGE_TIP],
  ])('%s tip is plain words and avoids nearby labels', (_name, tip) => {
    expect(tip.length).toBeGreaterThan(30);
    const lower = tip.toLowerCase();
    for (const label of NEARBY) {
      // The template tip names its Restore button: the card has two buttons, so "the button" was unclear.
      if (label === 'restore' && tip === ARCHIVED_TEMPLATE_TIP) {
        continue;
      }
      expect(lower).not.toContain(label);
    }
  });

  it('tells you which button brings a template back', () => {
    expect(ARCHIVED_TEMPLATE_TIP).toContain('Press Restore on this card');
  });
});
