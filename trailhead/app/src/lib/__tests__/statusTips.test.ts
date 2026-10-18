import { describe, expect, it } from 'vitest';
import { consentSummary } from '../consent';
import { UPDATED_REASON } from '../consentChangelog';
import { STATUS_TEXT, type HealthStatus } from '../healthForm';
import {
  ADULT_PENDING_TIP,
  HELD_EXISTING_TIP,
  HELD_NEW_TIP,
  PARENT_REQUEST_TIP,
  PAUSED_TIP,
  REVIEW_TIP,
  healthTip,
  yptTip,
} from '../statusTips';
import { YPT_TEXT, type YptStatus } from '../ypt';
import type { ConsentDoc } from '../types';

const HEALTH: HealthStatus[] = ['current', 'expiring', 'expired', 'missing'];
const YPT: YptStatus[] = ['current', 'expiring', 'lapsed', 'missing', 'notRequired'];

describe('status explanations', () => {
  it('explains every health form part and status, and says which part it is', () => {
    for (const status of HEALTH) {
      expect(healthTip('partsAB', status)).toMatch(/^Parts A and B .+ \S/);
      expect(healthTip('partC', status)).toMatch(/^Part C is the physical/);
      expect(healthTip('partsAB', status)).not.toContain(`Health A and B: ${STATUS_TEXT[status]}`);
    }
  });

  it('explains every YPT status, and why the training is needed', () => {
    for (const status of YPT) {
      expect(yptTip(status)).toContain('Youth Protection training');
      expect(yptTip(status)).not.toContain(YPT_TEXT[status]);
    }
  });

  it('gives every consent summary an explanation of the parent notice', () => {
    const docs: [ConsentDoc | null, boolean, boolean][] = [
      [{ id: 's', withdrawal: { uid: 'u', memberId: 'm' } }, true, false],
      [{ id: 's', parentConsents: [{ uid: 'u', memberId: 'm', version: '2026-10-18.1' }] }, true, false],
      [{ id: 's', leaderConfirmation: { uid: 'u', memberId: 'm' } }, true, false],
      [null, true, true],
      [null, true, false],
      [null, false, false],
    ];
    const tips = docs.map(([doc, hasParent, waiting]) => consentSummary(doc, hasParent, waiting));
    for (const { text, tip } of tips) {
      expect(tip).toContain('parent notice');
      expect(tip).not.toContain(text);
    }
    expect(new Set(tips.map((t) => t.tip)).size).toBe(tips.length);
  });

  it("never repeats a pill's own words, so finding the pill by its text finds only the pill", () => {
    const pairs: [string, string][] = [
      [HELD_NEW_TIP, 'Waiting for parent consent'],
      [HELD_EXISTING_TIP, 'Needs parent consent'],
      [REVIEW_TIP, "Parent hasn't reviewed the new notice"],
      [PAUSED_TIP, UPDATED_REASON],
      [ADULT_PENDING_TIP, 'Has not agreed to the parent notice'],
      [PARENT_REQUEST_TIP.emailed, 'Emailed'],
      [PARENT_REQUEST_TIP.agreed, 'Agreed'],
      [PARENT_REQUEST_TIP.declined, 'Declined'],
      [PARENT_REQUEST_TIP.noAnswer, 'No answer'],
    ];
    for (const [tip, label] of pairs) {
      expect(tip.toLowerCase()).not.toContain(label.toLowerCase());
    }
  });

  it('never uses the parent request words, which sit side by side in the same list', () => {
    const all = [
      ...HEALTH.flatMap((s) => [healthTip('partsAB', s), healthTip('partC', s)]),
      ...YPT.map(yptTip),
      HELD_NEW_TIP,
      HELD_EXISTING_TIP,
      REVIEW_TIP,
      PAUSED_TIP,
      ADULT_PENDING_TIP,
      ...Object.values(PARENT_REQUEST_TIP),
      consentSummary(null, true, false).tip,
      consentSummary({ id: 's', parentConsents: [{ uid: 'u', memberId: 'm', version: 'v' }] }, true, false).tip,
    ];
    for (const tip of all) {
      expect(tip).not.toMatch(/\b(emailed|agreed|declined|no answer)\b/i);
    }
  });
});
