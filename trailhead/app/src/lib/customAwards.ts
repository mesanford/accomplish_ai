import type { MoveSummary } from './api';
import { awardName } from './catalog';
import type { CustomAward, CustomRequirement } from './types';

/** Troop-made award ids carry this prefix, so they never collide with merit badge or rank ids. */
export const CUSTOM_PREFIX = 'custom-';

export function isCustomAward(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

/** Display name for any award id: a troop award, a merit badge or a rank. */
export function resolveAwardName(id: string, custom: ReadonlyMap<string, CustomAward>): string {
  if (isCustomAward(id)) {
    return custom.get(id)?.name ?? 'Troop award';
  }
  return awardName(id);
}

/** A row in the requirement editor. `key` is local to the editor; `id` comes from the saved version. */
export interface RequirementRow {
  key: string;
  id?: string;
  label: string;
  text: string;
}

let nextKey = 0;

export function newRow(label = '', text = ''): RequirementRow {
  nextKey += 1;
  return { key: `row-${nextKey}`, label, text };
}

export function rowsFrom(requirements: CustomRequirement[]): RequirementRow[] {
  return requirements.map((r) => ({ ...newRow(r.label, r.text), id: r.id }));
}

export function moveRow(rows: RequirementRow[], index: number, by: -1 | 1): RequirementRow[] {
  const target = index + by;
  if (target < 0 || target >= rows.length) {
    return rows;
  }
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The next number to suggest for a new row: one past the last plain number, else the row count. */
export function suggestLabel(rows: RequirementRow[]): string {
  const numbers = rows.map((r) => Number.parseInt(r.label, 10)).filter((n) => Number.isFinite(n));
  return String(numbers.length > 0 ? Math.max(...numbers) + 1 : rows.length + 1);
}

/** Whether saving these rows will create a new version (any change to the requirement list). */
export function requirementsChanged(saved: CustomRequirement[], rows: RequirementRow[]): boolean {
  if (saved.length !== rows.length) {
    return true;
  }
  return saved.some((r, i) => r.id !== rows[i].id || r.label !== rows[i].label.trim() || r.text !== rows[i].text.trim());
}

function listed(labels: string[]): string {
  return labels.join(', ');
}

/** Plain sentences describing what a version move did. */
export function describeMove(summary: MoveSummary): string[] {
  const lines: string[] = [];
  if (summary.carried.length > 0) {
    lines.push(`Carried over: ${listed(summary.carried)}.`);
  } else {
    lines.push('Nothing carried over.');
  }
  if (summary.needsReview.length > 0) {
    lines.push(`Needs review, because the wording changed: ${listed(summary.needsReview)}. Sign these again once checked.`);
  }
  if (summary.dropped.length > 0) {
    lines.push(`No longer in the award: ${listed(summary.dropped)}.`);
  }
  return lines;
}
