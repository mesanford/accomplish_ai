import { describe, expect, it } from 'vitest';
import type { RequirementsDoc } from '../requirements';
import { selectedRequirementLabel, shortenText } from '../selectedRequirement';

const doc: RequirementsDoc = {
  awardId: 'x',
  name: 'X',
  kind: 'rank',
  sourceUrl: '',
  fetchedAt: '',
  requirements: [
    {
      id: '1',
      label: '1.',
      text: 'Do the following:',
      resources: [],
      children: [
        { id: '1a', label: '(a)', text: 'Tie a knot.', resources: [], children: [] },
        { id: '1b', label: '(b)', text: 'word '.repeat(40), resources: [], children: [] },
        { id: '1c', label: '(c)', text: '', resources: [], children: [] },
      ],
    },
  ],
};

describe('selectedRequirementLabel', () => {
  it('shows the number and text', () => {
    expect(selectedRequirementLabel(doc, '1a')).toBe('1a. Tie a knot.');
  });
  it('matches typed ids loosely', () => {
    expect(selectedRequirementLabel(doc, ' 1A ')).toBe('1a. Tie a knot.');
  });
  it('shortens long text', () => {
    const out = selectedRequirementLabel(doc, '1b');
    expect(out.length).toBeLessThan(100);
    expect(out.endsWith('…')).toBe(true);
  });
  it('falls back to the id', () => {
    expect(selectedRequirementLabel(null, '4b')).toBe('4b');
    expect(selectedRequirementLabel(doc, '9z')).toBe('9z');
    expect(selectedRequirementLabel(doc, '1c')).toBe('1c');
  });
  it('never repeats the signed message', () => {
    expect(selectedRequirementLabel(doc, '1a')).not.toMatch(/signed/i);
    expect(shortenText('short')).toBe('short');
  });
});
