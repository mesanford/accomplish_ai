import type { ScoutbookRow } from './types';

export const KIND_LABELS: Record<ScoutbookRow['kind'], string> = {
  rank: 'Rank',
  merit_badge: 'Merit badge',
  requirement: 'Requirement',
};

export interface ScoutGroup {
  scoutId: string;
  scoutName: string;
  rows: ScoutbookRow[];
}

/** Rows arrive sorted by Scout; this keeps that order and gathers each Scout's rows together. */
export function groupByScout(rows: ScoutbookRow[]): ScoutGroup[] {
  const groups = new Map<string, ScoutGroup>();
  for (const row of rows) {
    const group = groups.get(row.scoutId) ?? { scoutId: row.scoutId, scoutName: row.scoutName, rows: [] };
    group.rows.push(row);
    groups.set(row.scoutId, group);
  }
  return [...groups.values()];
}

function cell(value: string | undefined): string {
  // A leading = + - @ would be read as a formula when the file is opened in a spreadsheet.
  const text = /^[=+\-@]/.test(value ?? '') ? `'${value}` : (value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADER = ['Scout', 'Type', 'Award', 'Requirement', 'Date', 'Signed by'];

/** The report as CSV text, one line per row, in the order given. */
export function reportToCsv(rows: ScoutbookRow[]): string {
  const lines = rows.map((r) =>
    [r.scoutName, KIND_LABELS[r.kind], r.awardName, r.requirement, r.date, r.signedBy].map(cell).join(','),
  );
  return [CSV_HEADER.join(','), ...lines].join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
