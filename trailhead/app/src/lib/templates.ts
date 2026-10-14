import type { PathItemDoc, PathTemplate, TemplateItem } from './types';

export const DEFAULT_DURATION_DAYS = 28;
const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Adds whole days to a 'YYYY-MM-DD' date, crossing month and year ends correctly. */
export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
}

export function daysToWeeks(days: number): number {
  return Math.round((days / 7) * 10) / 10;
}

export function weeksToDays(weeks: number): number {
  return Math.max(0, Math.round(weeks * 7));
}

export type ApplyMode = 'replace' | 'add';

export interface ApplyResult {
  items: PathItemDoc[];
  /** Badges the template adds to the plan. */
  added: PathItemDoc[];
  /** Badges left out because the Scout already earned them or already plans them. */
  skipped: string[];
}

interface ApplyInput {
  template: Pick<PathTemplate, 'items'>;
  current: PathItemDoc[];
  today: string;
  mode: ApplyMode;
  /** Awards the Scout has already completed. */
  earned?: Iterable<string>;
}

/** Turns a template into dated plan items, counting from today. Never duplicates a badge. */
export function applyTemplate({ template, current, today, mode, earned = [] }: ApplyInput): ApplyResult {
  const earnedSet = new Set(earned);
  const kept = mode === 'add' ? current : [];
  const taken = new Set(kept.map((i) => i.awardId));
  const added: PathItemDoc[] = [];
  const skipped: string[] = [];
  for (const item of template.items) {
    if (earnedSet.has(item.awardId) || taken.has(item.awardId)) {
      skipped.push(item.awardId);
      continue;
    }
    taken.add(item.awardId);
    const plannedStart = addDays(today, item.startOffsetDays);
    added.push({ awardId: item.awardId, plannedStart, plannedEnd: addDays(plannedStart, item.durationDays) });
  }
  return { items: [...kept, ...added], added, skipped };
}

/** Converts a dated plan into offsets from its earliest start. Undated badges start at day 0. */
export function planToTemplateItems(items: PathItemDoc[]): TemplateItem[] {
  const starts = items.map((i) => i.plannedStart).filter((s): s is string => Boolean(s));
  const earliest = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  return items.map((item) => {
    const offset = earliest && item.plannedStart ? daysBetween(earliest, item.plannedStart) : 0;
    const length = item.plannedStart && item.plannedEnd ? daysBetween(item.plannedStart, item.plannedEnd) : 0;
    return {
      awardId: item.awardId,
      startOffsetDays: offset,
      durationDays: length > 0 ? length : DEFAULT_DURATION_DAYS,
    };
  });
}
