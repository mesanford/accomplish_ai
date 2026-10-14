import { BADGES } from './catalog';

// Turns a pasted list of earned merit badges (one per line, such as copied from Scoutbook or a spreadsheet)
// into badge ids with dates. Lines that can't be matched are returned so the leader can fix them.

export interface ParsedBadge {
  awardId: string;
  name: string;
  date: string;
  line: string;
}

export interface ParseResult {
  matched: ParsedBadge[];
  unmatched: { line: string; reason: string }[];
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bmerit badge\b|\bmb\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const BY_NAME = new Map(BADGES.map((b) => [normalize(b.name), b]));

const ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
const US = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/;

/** The first date in the text as YYYY-MM-DD, or null. Two-digit years are read as 20xx. */
export function findDate(text: string): { iso: string; raw: string } | null {
  const pad = (n: string) => n.padStart(2, '0');
  const iso = text.match(ISO);
  if (iso) {
    return { iso: `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`, raw: iso[0] };
  }
  const us = text.match(US);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return { iso: `${year}-${pad(us[1])}-${pad(us[2])}`, raw: us[0] };
  }
  return null;
}

function matchBadge(text: string) {
  const name = normalize(text);
  const exact = BY_NAME.get(name);
  if (exact) {
    return exact;
  }
  // Allow extra words around the name ("Camping - completed at summer camp"), preferring the longest name.
  const found = [...BY_NAME.entries()].filter(([n]) => name.includes(n)).sort((a, b) => b[0].length - a[0].length);
  return found[0]?.[1];
}

export function parseBadgeList(text: string, fallbackDate = ''): ParseResult {
  const result: ParseResult = { matched: [], unmatched: [] };
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const date = findDate(line);
    const badge = matchBadge(date ? line.replace(date.raw, ' ') : line);
    if (!badge) {
      result.unmatched.push({ line, reason: "Couldn't find a merit badge name" });
      continue;
    }
    const iso = date?.iso ?? fallbackDate;
    if (!iso) {
      result.unmatched.push({ line, reason: 'No date' });
      continue;
    }
    if (!seen.has(badge.id)) {
      seen.add(badge.id);
      result.matched.push({ awardId: badge.id, name: badge.name, date: iso, line });
    }
  }
  return result;
}
