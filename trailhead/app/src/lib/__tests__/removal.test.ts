import { describe, expect, it } from 'vitest';
import { ACCOUNT_KEPT, CANNOT_UNDO, SCOUT_DELETES, sameName } from '../removal';

describe('sameName', () => {
  it('accepts the name however it is capitalised or spaced', () => {
    expect(sameName('sam  jones ', 'Sam Jones')).toBe(true);
    expect(sameName('Sam Jones', 'Sam Jones')).toBe(true);
  });

  it('rejects other text, partial names and empty input', () => {
    expect(sameName('Sam', 'Sam Jones')).toBe(false);
    expect(sameName('Sam Jonesy', 'Sam Jones')).toBe(false);
    expect(sameName('', 'Sam Jones')).toBe(false);
    expect(sameName('', '')).toBe(false);
  });
});

describe('deletion copy', () => {
  it('says plainly that it cannot be undone', () => {
    expect(CANNOT_UNDO).toBe('This cannot be undone.');
  });

  it('lists what goes, and tells a parent their Scouts stay and how to remove one', () => {
    expect(SCOUT_DELETES.some((line) => line.includes('blue cards'))).toBe(true);
    expect(ACCOUNT_KEPT[0]).toContain('ask a troop leader to use Remove from troop');
  });
});
