import { rank } from './catalog';
import { cell } from './equipmentCsv';
import { roleList } from './roles';
import type { Member, ScoutRecord } from './types';
import { YPT_TEXT, yptInfo, type YptStatus } from './ypt';

export interface RechartRow {
  id: string;
  name: string;
  kind: 'adult' | 'scout';
  roles: string;
  /** YYYY-MM-DD, or empty. */
  yptExpires: string;
  /** Words for the YPT column ("current", "lapsed", "Not needed"), empty for Scouts. */
  yptStatus: string;
  yptTone: YptStatus | null;
  birthMonth: number | null;
  birthYear: number | null;
  rank: string;
  /** Plain sentences about what to fix before the roster goes to the council. */
  problems: string[];
}

function wholeNumber(value: unknown, low: number, high: number): number | null {
  return Number.isInteger(value) && (value as number) >= low && (value as number) <= high ? (value as number) : null;
}

function scoutRow(m: Member, record: ScoutRecord | undefined): RechartRow {
  const month = wholeNumber(record?.birthMonth, 1, 12);
  const year = wholeNumber(record?.birthYear, 1900, 2200);
  const rankName = rank(record?.currentRankId ?? '')?.name ?? '';
  const problems: string[] = [];
  if (!month || !year) {
    problems.push('Birth month and year are missing.');
  }
  if (!rankName) {
    problems.push('Rank is missing.');
  }
  const base = { id: m.id, name: m.displayName, kind: 'scout' as const, roles: 'Scout', yptExpires: '', yptStatus: '', yptTone: null };
  return { ...base, birthMonth: month, birthYear: year, rank: rankName, problems };
}

const YPT_PROBLEMS: Partial<Record<YptStatus, string>> = {
  lapsed: 'Youth Protection training has lapsed.',
  missing: 'Youth Protection training date is missing.',
  expiring: 'Youth Protection training expires within 30 days.',
};

function adultRow(m: Member, today: string): RechartRow {
  const info = yptInfo(m, today);
  const problems: string[] = [];
  if (YPT_PROBLEMS[info.status]) {
    problems.push(YPT_PROBLEMS[info.status] as string);
  }
  if (!(m.roles ?? []).length) {
    problems.push('No role is set.');
  }
  const status = info.status === 'notRequired' ? 'Not needed' : YPT_TEXT[info.status].replace('YPT ', '');
  return {
    id: m.id,
    name: m.displayName,
    kind: 'adult',
    roles: roleList(m.roles),
    yptExpires: info.expires ?? '',
    yptStatus: status,
    yptTone: info.status,
    birthMonth: null,
    birthYear: null,
    rank: '',
    problems,
  };
}

/** One row for each current member (not marked as having left): Scouts first, then adults, each by name. */
export function rechartRows(members: Member[], records: Record<string, ScoutRecord | undefined>, today: string): RechartRow[] {
  const rows = members
    .filter((m) => !m.leftAt)
    .map((m) => (m.kind === 'scout' ? scoutRow(m, records[m.id]) : adultRow(m, today)));
  const order = (r: RechartRow) => (r.kind === 'scout' ? 0 : 1);
  return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

export const RECHARTER_HEADER = ['Name', 'Type', 'Roles', 'YPT expires', 'YPT status', 'Birth month', 'Birth year', 'Rank', 'Problems'];

/** A spreadsheet of the rows. Names and sentences are escaped, and anything that could run as a formula is defused. */
export function rechartCsv(rows: RechartRow[]): string {
  const lines = rows.map((r) => [
    r.name,
    r.kind === 'scout' ? 'Scout' : 'Adult',
    r.roles,
    r.yptExpires,
    r.yptStatus,
    r.birthMonth ?? '',
    r.birthYear ?? '',
    r.rank,
    r.problems.join(' '),
  ]);
  return [RECHARTER_HEADER, ...lines].map((line) => line.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const rechartFileName = (today: string): string => `recharter-roster-${today}.csv`;
