import { describe, expect, it } from 'vitest';
import {
  cardFileProblem,
  cardPhotoPath,
  counselorLabel,
  hasOutsideCounselor,
  paperRequirements,
  safeFileName,
  signedForCounselors,
} from '../cards';

const uidName = (uid?: string) => (uid ? 'Pat Member' : 'Not assigned');

describe('counselor display', () => {
  it('shows an outside counselor by name, a member by login, and nobody as not assigned', () => {
    expect(counselorLabel({ counselorName: 'Jordan Smith' }, uidName)).toBe('Jordan Smith (outside the troop)');
    expect(counselorLabel({ counselorUid: 'u1' }, uidName)).toBe('Pat Member');
    expect(counselorLabel({}, uidName)).toBe('Not assigned');
  });

  it('treats a card as outside only with a name and no login', () => {
    expect(hasOutsideCounselor({ counselorName: 'Jordan' })).toBe(true);
    expect(hasOutsideCounselor({ counselorName: 'Jordan', counselorUid: 'u1' })).toBe(false);
    expect(hasOutsideCounselor({ counselorUid: 'u1' })).toBe(false);
  });
});

describe('signedForCounselors', () => {
  it('groups signed requirements by the counselor they were signed for, in requirement order', () => {
    const out = signedForCounselors({
      requirements: {
        '10': { status: 'signed', onBehalfOf: 'Jordan Smith' },
        '2a': { status: 'signed', onBehalfOf: 'Jordan Smith' },
        '3': { status: 'signed' },
        '4': { status: 'ready', onBehalfOf: 'Jordan Smith' },
      },
    });
    expect(out).toEqual([{ counselor: 'Jordan Smith', reqIds: ['2a', '10'] }]);
    expect(signedForCounselors({})).toEqual([]);
  });
});

describe('card photo files', () => {
  it('makes safe storage paths', () => {
    expect(safeFileName('My Card (1).JPG')).toBe('my-card-1.jpg');
    expect(safeFileName('///')).toBe('card');
    expect(cardPhotoPath('t1', 's1', 's1_camping', 'Front.png', 'abc')).toBe('cards/t1/s1/s1_camping/abc-front.png');
  });

  it('accepts photos and PDFs under 10 MB only', () => {
    expect(cardFileProblem({ name: 'a.png', type: 'image/png', size: 100 })).toBeNull();
    expect(cardFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 100 })).toBeNull();
    expect(cardFileProblem({ name: 'a.txt', type: 'text/plain', size: 100 })).toMatch(/isn't a photo or PDF/);
    expect(cardFileProblem({ name: 'a.png', type: 'image/png', size: 10 * 1024 * 1024 })).toMatch(/larger than 10 MB/);
  });
});

describe('paperRequirements', () => {
  it('uses each requirement date, then the shared date, and reports requirements with neither', () => {
    const out = paperRequirements(['1', '2a', '3'], { '1': '2026-05-01' }, '2026-06-01');
    expect(out.requirements).toEqual([
      { reqId: '1', date: '2026-05-01' },
      { reqId: '2a', date: '2026-06-01' },
      { reqId: '3', date: '2026-06-01' },
    ]);
    expect(out.missing).toEqual([]);
    expect(paperRequirements(['1', '2'], { '1': '2026-05-01' }, '')).toEqual({
      requirements: [{ reqId: '1', date: '2026-05-01' }],
      missing: ['2'],
    });
  });
});
