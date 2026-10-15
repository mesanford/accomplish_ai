import { badge } from './catalog';

// Official requirement text, served as static JSON from /requirements/<awardId>.json and loaded on demand.
export interface RequirementResource {
  title: string;
  url: string;
}

export interface Requirement {
  id: string;
  label: string;
  text: string;
  resources: RequirementResource[];
  children: Requirement[];
}

export interface RequirementsDoc {
  awardId: string;
  name: string;
  kind: 'merit_badge' | 'rank';
  sourceUrl: string;
  fetchedAt: string;
  note?: string;
  requirements: Requirement[];
}

export interface FlatRequirement extends Requirement {
  depth: number;
}

/** Unlabeled bullet points under a requirement (ids ending -h1, -h2…) are prompts within it, not requirements. */
export function isBulletPrompt(req: Requirement): boolean {
  return /-h\d+$/.test(req.id);
}

/**
 * Requirements with lettered or numbered parts are headings; Scouts complete and sign the parts.
 * A requirement whose only parts are bullet prompts is signed as a whole.
 */
export function isSignable(req: Requirement): boolean {
  if (isBulletPrompt(req)) {
    return false;
  }
  return req.children.every(isBulletPrompt);
}

export const REQUIREMENTS_ATTRIBUTION = 'Requirements © Scouting America. Shown from scouting.org for troop use.';
const RANKS_URL = 'https://www.scouting.org/programs/scouts-bsa/advancement-and-awards/';

/** "4B", "4b.", "4(b)" and " 4 b " all become "4b"; "9a(1)" and "9a1" both become "9a1". */
export function normalizeReqId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function flatten(requirements: Requirement[], depth = 0): FlatRequirement[] {
  return requirements.flatMap((r) => [{ ...r, depth }, ...flatten(r.children ?? [], depth + 1)]);
}

export function findRequirement(doc: RequirementsDoc | null | undefined, reqId: string): FlatRequirement | undefined {
  const wanted = normalizeReqId(reqId);
  if (!doc || !wanted) {
    return undefined;
  }
  return flatten(doc.requirements).find((r) => normalizeReqId(r.id) === wanted);
}

/** Map normalized requirement ids to a status, so typed ids from older sign-offs still line up. */
export function statusLookup<T extends string>(states: Record<string, { status: T }> | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, s] of Object.entries(states ?? {})) {
    out[normalizeReqId(id)] = s.status;
  }
  return out;
}

/** A note cut off mid-sentence at its source is shortened to its last complete sentence, so it never ends mid-thought. */
export function wholeSentences(text: string): string {
  const t = text.trim();
  if (/[.!?]["')\]]?$/.test(t)) {
    return t;
  }
  const end = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '));
  return end > 0 ? t.slice(0, end + 1) : t;
}

/** Where to read the official requirements when the text is not available in the app. */
export function officialRequirementsUrl(awardId: string): string {
  return badge(awardId)?.officialUrl ?? RANKS_URL;
}

export function isCustomAwardId(awardId: string): boolean {
  return awardId.startsWith('custom-');
}

const cache = new Map<string, Promise<RequirementsDoc | null>>();

function valid(data: unknown): data is RequirementsDoc {
  return typeof data === 'object' && data !== null && Array.isArray((data as RequirementsDoc).requirements);
}

async function fetchDoc(awardId: string): Promise<RequirementsDoc | null> {
  const res = await fetch(`/requirements/${encodeURIComponent(awardId)}.json`);
  if (!res.ok) {
    return null;
  }
  try {
    const data: unknown = await res.json();
    return valid(data) ? data : null;
  } catch {
    // A dev server may answer a missing file with the app's HTML page.
    return null;
  }
}

/** Fetch one award's requirements once; null when the file is missing. */
export function loadRequirements(awardId: string): Promise<RequirementsDoc | null> {
  if (isCustomAwardId(awardId)) {
    return Promise.resolve(null);
  }
  const hit = cache.get(awardId);
  if (hit) {
    return hit;
  }
  const pending = fetchDoc(awardId).catch(() => {
    // A network failure is not remembered, so a later try can succeed.
    cache.delete(awardId);
    return null;
  });
  cache.set(awardId, pending);
  return pending;
}

export function clearRequirementsCache(): void {
  cache.clear();
}
