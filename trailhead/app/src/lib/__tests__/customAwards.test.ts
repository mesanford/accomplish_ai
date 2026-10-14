import { describe, expect, it } from 'vitest';
import {
  describeMove,
  isCustomAward,
  moveRow,
  newRow,
  requirementsChanged,
  resolveAwardName,
  rowsFrom,
  suggestLabel,
} from '../customAwards';
import type { CustomAward } from '../types';

const trail: CustomAward = { id: 'custom-abc', name: 'First-Year Trail', currentVersionId: 'v2' };
const custom = new Map([[trail.id, trail]]);
const saved = [
  { id: 'r1', label: '1', text: 'Attend three meetings.' },
  { id: 'r2', label: '2', text: 'Lead a game.' },
];

describe('custom awards', () => {
  it('names troop awards without breaking catalog lookups', () => {
    expect(isCustomAward('custom-abc')).toBe(true);
    expect(isCustomAward('camping')).toBe(false);
    expect(resolveAwardName('custom-abc', custom)).toBe('First-Year Trail');
    expect(resolveAwardName('custom-gone', custom)).toBe('Troop award');
    expect(resolveAwardName('personal-management', custom)).toBe('Personal Management');
    expect(resolveAwardName('life', custom)).toBe('Life');
  });

  it('reorders rows and ignores moves past either end', () => {
    const rows = [newRow('1', 'a'), newRow('2', 'b'), newRow('3', 'c')];
    expect(moveRow(rows, 2, 1)).toBe(rows);
    expect(moveRow(rows, 0, -1)).toBe(rows);
    expect(moveRow(rows, 1, -1).map((r) => r.text)).toEqual(['b', 'a', 'c']);
  });

  it('suggests the next requirement number', () => {
    expect(suggestLabel([newRow('1'), newRow('2')])).toBe('3');
    expect(suggestLabel([newRow('a'), newRow('b')])).toBe('3');
  });

  it('knows when an edit makes a new version', () => {
    const rows = rowsFrom(saved);
    expect(requirementsChanged(saved, rows)).toBe(false);
    expect(requirementsChanged(saved, [rows[0], { ...rows[1], text: 'Lead two games.' }])).toBe(true);
    expect(requirementsChanged(saved, [rows[1], rows[0]])).toBe(true);
    expect(requirementsChanged(saved, [...rows, newRow('3', 'New')])).toBe(true);
  });

  it('describes a version move in plain words', () => {
    const lines = describeMove({ fromVersionId: 'v1', toVersionId: 'v2', carried: ['1'], needsReview: ['2'], dropped: [] });
    expect(lines[0]).toBe('Carried over: 1.');
    expect(lines[1]).toContain('Needs review');
    expect(describeMove({ fromVersionId: 'v1', toVersionId: 'v2', carried: [], needsReview: [], dropped: ['3'] })).toEqual([
      'Nothing carried over.',
      'No longer in the award: 3.',
    ]);
  });
});
