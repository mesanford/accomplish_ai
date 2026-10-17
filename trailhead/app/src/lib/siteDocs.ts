/** The troop document library. Mirrors functions/handlers/documents.py and the rules in firestore.rules and
 * storage.rules. Visibility: public (on the troop website and open to members), members, or leaders only. */
import type { Timestamp } from 'firebase/firestore';

export type Visibility = 'public' | 'members' | 'leaders';
export type DocCategory = 'permission' | 'gear' | 'handbook' | 'medical' | 'other';

export interface TroopDocument {
  id: string;
  title: string;
  category: DocCategory;
  visibility: Visibility;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
  scoutIds?: string[];
  noScoutsShown?: boolean;
  createdBy: string;
  createdAt?: Timestamp;
}

export const MAX_DOC_BYTES = 20 * 1024 * 1024;
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOC = 'application/msword';
export const IMAGE_DOC_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const DOC_TYPES = ['application/pdf', DOC, DOCX, ...IMAGE_DOC_TYPES];
export const DOC_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,application/pdf,image/*';

export const CATEGORIES: [DocCategory, string][] = [
  ['permission', 'Permission slips'],
  ['gear', 'Gear lists'],
  ['handbook', 'Handbook'],
  ['medical', 'Medical forms'],
  ['other', 'Other'],
];
export const categoryLabel = (c: string): string => CATEGORIES.find(([id]) => id === c)?.[1] ?? 'Other';

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: 'Public: on the troop website',
  members: 'Members: everyone in the troop',
  leaders: 'Leaders only',
};

/** Old .doc files and medical forms can't be made public. */
export function canBePublic(doc: { category: string; contentType: string }): boolean {
  return doc.category !== 'medical' && doc.contentType !== DOC;
}

export function visibilityChoices(doc: { category: string; contentType: string }): Visibility[] {
  return canBePublic(doc) ? ['public', 'members', 'leaders'] : ['members', 'leaders'];
}

/** A message if the file can't be added (wrong type or too big), otherwise null. */
export function docProblem(file: { type: string; size: number }): string | null {
  if (!DOC_TYPES.includes(file.type)) {
    return 'Choose a PDF, Word file or image (PNG, JPEG, GIF or WebP).';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  if (file.size > MAX_DOC_BYTES) {
    return 'Documents can be up to 20 MB. Choose a smaller file.';
  }
  return null;
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'document';
}

export const docStoragePath = (troopId: string, docId: string, fileName: string): string =>
  `docs/${troopId}/${docId}/${safeFileName(fileName)}`;

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 120);
}

export function fileKind(contentType: string): string {
  if (contentType === 'application/pdf') {
    return 'PDF';
  }
  if (contentType === DOC || contentType === DOCX) {
    return 'Word';
  }
  return 'Image';
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) {
    return '';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Documents grouped by category in the usual order, each group sorted by title. Empty groups are left out. */
export function groupByCategory<T extends { category: string; title: string }>(docs: T[]): [string, T[]][] {
  return CATEGORIES.map(([id, label]): [string, T[]] => [
    label,
    docs.filter((d) => (CATEGORIES.some(([c]) => c === d.category) ? d.category : 'other') === id).sort((a, b) => a.title.localeCompare(b.title)),
  ]).filter(([, list]) => list.length > 0);
}

/** Who can open a document: leaders any; other members those shared with members or public. Mirrors the rules. */
export function canOpen(doc: Pick<TroopDocument, 'visibility'>, isLeader: boolean): boolean {
  return isLeader || doc.visibility === 'members' || doc.visibility === 'public';
}
