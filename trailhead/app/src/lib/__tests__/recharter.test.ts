import type { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { RECHARTER_HEADER, rechartCsv, rechartFileName, rechartRows } from '../recharter';
import type { Member, ScoutRecord } from '../types';
import { needsYpt, yptAttention, yptInfo } from '../ypt';

const TODAY = '2026-10-17';
const stamp = (iso: string) => ({ toDate: () => new Date(`${iso}T23:59:00Z`) }) as unknown as Timestamp;
const adult = (id: string, name: string, roles: Member['roles'], ypt?: string, more: Partial<Member> = {}): Member => ({
  id,
  kind: 'adult',
  displayName: name,
  roles,
  ...(ypt ? { yptExpiresAt: stamp(ypt) } : {}),
  ...more,
});
const scout = (id: string, name: string, more: Partial<Member> = {}): Member => ({ id, kind: 'scout', displayName: name, ...more });
const record = (more: Partial<ScoutRecord> = {}): ScoutRecord => ({
  birthYear: 2012,
  birthMonth: 5,
  currentRankId: 'first-class',
  rankDates: {},
  ...more,
});

describe('yptInfo', () => {
  it('uses the date the leader typed, whatever the time zone', () => {
    expect(yptInfo(adult('a', 'A', ['leader'], '2026-12-01'), TODAY)).toEqual({ status: 'current', expires: '2026-12-01' });
  });

  it('has the same windows as the server: 30 days is soon, the day after the date is lapsed', () => {
    const at = (iso: string) => yptInfo(adult('a', 'A', ['leader'], iso), TODAY).status;
    expect(at('2026-11-17')).toBe('current'); // 31 days
    expect(at('2026-11-16')).toBe('expiring'); // 30 days
    expect(at('2026-10-17')).toBe('expiring'); // the last valid day
    expect(at('2026-10-16')).toBe('lapsed');
  });

  it('does not ask parents, treasurers, Scouts or people who left for training', () => {
    expect(needsYpt(adult('a', 'A', ['parent']))).toBe(false);
    expect(needsYpt(adult('a', 'A', ['treasurer']))).toBe(false);
    expect(needsYpt(scout('s', 'S'))).toBe(false);
    expect(needsYpt(adult('a', 'A', ['leader'], undefined, { leftAt: stamp('2026-01-01') }))).toBe(false);
    expect(needsYpt(adult('a', 'A', ['parent', 'counselor']))).toBe(true);
    expect(yptInfo(adult('a', 'A', ['leader']), TODAY).status).toBe('missing');
  });

  it('lists the adults who need attention', () => {
    const people = [
      adult('1', 'Fine', ['leader'], '2027-06-01'),
      adult('2', 'Soon', ['leader'], '2026-11-01'),
      adult('3', 'Late', ['counselor'], '2026-09-01'),
      adult('4', 'None', ['committee']),
      adult('5', 'Mom', ['parent']),
      scout('s', 'Kid'),
    ];
    expect(yptAttention(people, TODAY).map((m) => m.displayName)).toEqual(['Soon', 'Late', 'None']);
  });
});

describe('rechartRows', () => {
  const members = [
    adult('a1', 'Zed Leader', ['leader', 'scoutmaster'], '2027-06-01'),
    adult('a2', 'Amy Lapsed', ['counselor', 'parent'], '2026-09-01'),
    adult('a3', 'Mo Parent', ['parent']),
    scout('s2', 'Bo Scout'),
    scout('s1', 'Al Scout'),
    scout('s3', 'Gone Scout', { leftAt: stamp('2026-01-01') }),
  ];
  const records = { s1: record(), s2: record({ birthMonth: 0, currentRankId: '' }) };
  const rows = rechartRows(members, records, TODAY);

  it('lists current members only, Scouts first, each by name', () => {
    expect(rows.map((r) => r.name)).toEqual(['Al Scout', 'Bo Scout', 'Amy Lapsed', 'Mo Parent', 'Zed Leader']);
  });

  it('gives Scouts birth month, year and rank, and flags missing details', () => {
    expect(rows[0]).toMatchObject({ birthMonth: 5, birthYear: 2012, rank: 'First Class', problems: [] });
    expect(rows[1].problems).toEqual(['Birth month and year are missing.', 'Rank is missing.']);
  });

  it('flags lapsed training and leaves parents alone', () => {
    expect(rows[2]).toMatchObject({ yptStatus: 'lapsed', yptExpires: '2026-09-01' });
    expect(rows[2].problems).toEqual(['Youth Protection training has lapsed.']);
    expect(rows[3]).toMatchObject({ yptStatus: 'Not needed', problems: [] });
    expect(rows[4]).toMatchObject({ roles: 'Leader and Scoutmaster', yptStatus: 'current', problems: [] });
  });
});

describe('rechartCsv', () => {
  it('writes a header and one line per person', () => {
    const rows = rechartRows([scout('s1', 'Al Scout'), adult('a1', 'Zed Leader', ['leader'], '2027-06-01')], { s1: record() }, TODAY);
    const lines = rechartCsv(rows).trim().split('\r\n');
    expect(lines[0]).toBe(RECHARTER_HEADER.join(','));
    expect(lines[1]).toBe('Al Scout,Scout,Scout,,,5,2012,First Class,');
    expect(lines[2]).toBe('Zed Leader,Adult,Leader,2027-06-01,current,,,,');
  });

  it('escapes commas and quotes, and defuses spreadsheet formulas', () => {
    const rows = rechartRows([scout('s1', '=HYPERLINK("x")'), scout('s2', 'Last, First')], { s1: record(), s2: record() }, TODAY);
    const csv = rechartCsv(rows);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Last, First"');
  });

  it('puts problems in one cell and names the file by date', () => {
    const rows = rechartRows([scout('s1', 'Bo')], {}, TODAY);
    expect(rechartCsv(rows)).toContain('Bo,Scout,Scout,,,,,,Birth month and year are missing. Rank is missing.');
    expect(rechartFileName(TODAY)).toBe('recharter-roster-2026-10-17.csv');
  });
});
