import { describe, expect, it } from 'vitest';
import { incompleteWarning, signedCount } from '../completion';
import type { RequirementsDoc } from '../requirements';

const req = (id: string, children: RequirementsDoc['requirements'] = []) => ({
  id,
  label: id,
  text: '',
  resources: [],
  children,
});

const doc: RequirementsDoc = {
  awardId: 'chess',
  name: 'Chess',
  kind: 'merit_badge',
  sourceUrl: '',
  fetchedAt: '',
  // Requirement 1 is a heading with two signable parts, so the badge has three things to sign.
  requirements: [req('1', [req('1a'), req('1b')]), req('2')],
};

describe('signedCount', () => {
  it('counts only the parts that are signed, not headings', () => {
    expect(signedCount(doc, { '1a': 'signed', '1': 'signed' }, [])).toEqual({ signed: 1, total: 3 });
  });

  it('falls back to the signed ids without requirement text', () => {
    expect(signedCount(null, {}, ['1a', '2'])).toEqual({ signed: 2, total: null });
  });
});

describe('incompleteWarning', () => {
  it('names how many are signed', () => {
    expect(incompleteWarning('Chess', { signed: 1, total: 9 })).toBe(
      'Only 1 of 9 requirements are signed. Mark Chess complete anyway?',
    );
  });

  it('does not ask when everything is signed', () => {
    expect(incompleteWarning('Chess', { signed: 3, total: 3 })).toBeNull();
  });

  it('handles none signed and an unknown total', () => {
    expect(incompleteWarning('Chess', { signed: 0, total: 3 })).toBe('No requirements are signed. Mark Chess complete anyway?');
    expect(incompleteWarning('Chess', { signed: 1, total: null })).toBe(
      'Only 1 requirement is signed. Mark Chess complete anyway?',
    );
  });
});
