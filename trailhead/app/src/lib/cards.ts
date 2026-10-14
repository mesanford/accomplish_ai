import type { BlueCard, Progress } from './types';

/** Who counsels a card: an outside counselor's name, else the troop member's. */
export function counselorLabel(card: Pick<BlueCard, 'counselorName' | 'counselorUid'>, uidName: (uid?: string) => string): string {
  return card.counselorName ? `${card.counselorName} (outside the troop)` : uidName(card.counselorUid);
}

export const hasOutsideCounselor = (card: Pick<BlueCard, 'counselorName' | 'counselorUid'>): boolean =>
  Boolean(card.counselorName) && !card.counselorUid;

/** "Signed for Jordan Smith (counselor): 1, 2a" lines, one per outside counselor on a Scout's progress. */
export function signedForCounselors(progress: Pick<Progress, 'requirements'>): { counselor: string; reqIds: string[] }[] {
  const byName = new Map<string, string[]>();
  for (const [id, r] of Object.entries(progress.requirements ?? {})) {
    if (r.status === 'signed' && r.onBehalfOf) {
      byName.set(r.onBehalfOf, [...(byName.get(r.onBehalfOf) ?? []), id]);
    }
  }
  return [...byName].map(([counselor, reqIds]) => ({
    counselor,
    reqIds: reqIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  }));
}

/** A file name safe for a Storage path: letters, numbers, dots and dashes, with the extension kept. */
export function safeFileName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.slice(-60) || 'card';
}

export function cardPhotoPath(troopId: string, scoutId: string, cardId: string, fileName: string, unique: string): string {
  return `cards/${troopId}/${scoutId}/${cardId}/${unique}-${safeFileName(fileName)}`;
}

export const CARD_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
export const MAX_CARD_FILE_BYTES = 10 * 1024 * 1024 - 1;

/** A plain sentence about why a file can't be attached, or null when it can. */
export function cardFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!CARD_FILE_TYPES.includes(file.type)) {
    return `${file.name} isn't a photo or PDF. Use a PNG, JPEG, GIF, WebP or PDF file.`;
  }
  if (file.size > MAX_CARD_FILE_BYTES) {
    return `${file.name} is larger than 10 MB. Take a smaller photo.`;
  }
  return null;
}

export interface PaperRequirement {
  reqId: string;
  date: string;
}

/** Each chosen requirement with its own date, else the shared date. Requirements with no date are dropped from the list and returned in `missing`. */
export function paperRequirements(
  reqIds: string[],
  dates: Record<string, string>,
  sharedDate: string,
): { requirements: PaperRequirement[]; missing: string[] } {
  const requirements: PaperRequirement[] = [];
  const missing: string[] = [];
  for (const reqId of reqIds) {
    const date = dates[reqId] || sharedDate;
    if (date) {
      requirements.push({ reqId, date });
    } else {
      missing.push(reqId);
    }
  }
  return { requirements, missing };
}
