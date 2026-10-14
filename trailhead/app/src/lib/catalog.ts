import badgeDoc from '@content/merit_badges.json';
import rankDoc from '@content/ranks.json';

// Program content shared with the Python rules engine. Version ids match what scripts/seed.py loads.
export interface Badge {
  id: string;
  name: string;
  category: string;
  eagleRequired: boolean;
  eagleGroup: string | null;
  difficulty: number;
  typicalTime: string;
  summary: string;
  toughestPart: string;
  officialUrl: string;
  /** Discontinued badges: the last day a Scout who already started may finish. */
  finishBy?: string;
}

export interface Rank {
  id: string;
  name: string;
  order: number;
}

export const BADGES: Badge[] = badgeDoc.badges as Badge[];
export const RANKS: Rank[] = [...rankDoc.ranks].sort((a, b) => a.order - b.order);
export const BADGE_VERSION = badgeDoc.effectiveDate;
export const RANK_VERSION = rankDoc.effectiveDate;

const badgeById = new Map(BADGES.map((b) => [b.id, b]));
const rankById = new Map(RANKS.map((r) => [r.id, r]));

export function badge(id: string): Badge | undefined {
  return badgeById.get(id);
}

export function rank(id: string): Rank | undefined {
  return rankById.get(id);
}

/** Display name for any award id: a merit badge or a rank. */
export function awardName(id: string): string {
  return badgeById.get(id)?.name ?? rankById.get(id)?.name ?? id;
}

export function versionFor(awardId: string): string {
  return rankById.has(awardId) ? RANK_VERSION : BADGE_VERSION;
}

export const CATEGORY_LABELS: Record<string, string> = {
  outdoor: 'Outdoor Skills',
  nature: 'Nature & Environment',
  aquatics: 'Aquatics',
  stem: 'Science & Tech',
  trades: 'Trades & Crafts',
  arts_hobbies: 'Arts & Hobbies',
  citizenship: 'Citizenship & Heritage',
  health_safety_fitness: 'Health, Safety & Fitness',
  careers: 'Careers & Business',
};

const GROUP_LABELS: Record<string, string> = {
  emergency: 'Emergency Preparedness or Lifesaving',
  environment: 'Environmental Science or Sustainability',
  aquatic_or_endurance: 'Swimming, Hiking or Cycling',
};

export function eagleLabel(b: Badge): string | null {
  if (b.eagleRequired) {
    return 'Eagle required';
  }
  if (b.eagleGroup) {
    return `Eagle: ${GROUP_LABELS[b.eagleGroup]}`;
  }
  return null;
}

export function searchBadges(query: string, list: Badge[] = BADGES): Badge[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return list;
  }
  return list.filter((b) => `${b.name} ${b.summary} ${CATEGORY_LABELS[b.category]}`.toLowerCase().includes(q));
}

/** "Discontinued: finish by Dec 31, 2026" for discontinued badges, otherwise null. */
export function discontinuedLabel(b: Badge): string | null {
  if (!b.finishBy) {
    return null;
  }
  const [y, m, d] = b.finishBy.split('-').map(Number);
  const when = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `Discontinued: finish by ${when}`;
}
