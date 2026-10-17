import type { DateRange, TroopReport } from './activity';

/** A spreadsheet export of the troop report. Text that starts with = + - @ gets a leading apostrophe so a spreadsheet
 * never reads it as a formula. Numbers are plain, so a spreadsheet adds them up. */
function text(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const REPORT_HEADER = ['Scout', 'Patrol', 'Overnight campouts', 'Nights camped', 'Service hours', 'Miles hiked'];

export function reportCsv(report: TroopReport, patrolNames: Record<string, string>): string {
  const rows = report.rows.map((r) => [
    text(r.name),
    text(r.patrolId ? patrolNames[r.patrolId] : ''),
    String(r.campouts),
    String(r.nights),
    String(r.serviceHours),
    String(r.miles),
  ]);
  const t = report.total;
  const total = ['Troop total', '', String(t.campouts), String(t.nights), String(t.serviceHours), String(t.miles)];
  return [REPORT_HEADER, ...rows, total].map((r) => r.join(',')).join('\r\n') + '\r\n';
}

/** A file name that says which dates the report covers. */
export function reportFileName(range: DateRange): string {
  if (!range.from && !range.to) {
    return 'troop-activity-all-time.csv';
  }
  return `troop-activity-${range.from ?? 'start'}-to-${range.to ?? 'today'}.csv`;
}

export function downloadCsv(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
