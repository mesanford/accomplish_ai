import type { Timestamp } from 'firebase/firestore';
import type { Member, Troop } from './types';

/** troops/{t}/site/draft: what leaders edit. Only the publish_site function makes a public copy. */
export interface SiteDraft {
  slug: string;
  theme: { color: string; logoPath: string | null };
  cover: { heading: string; tagline: string; photoPath: string | null };
  about: string;
  meeting: { schedule: string; place: string; address: string | null };
  faq: { q: string; a: string }[];
  contacts: { memberId: string; role: string; email: string | null }[];
  gallery: GalleryItem[];
  recruiting: { open: boolean; intro: string };
  updatedAt?: Timestamp;
}

export interface GalleryItem {
  path: string;
  caption: string;
  scoutIds: string[];
  noScoutsShown: boolean;
}

export const DEFAULT_COLOR = '#4f6a2e';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const LIMITS = { faq: 20, contacts: 6, gallery: 24, about: 4000 };
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set(['admin', 'api', 's', 't', 'join', 'signin', 'create', 'www', 'app', 'help', 'login', 'settings', 'trailhead']);

/** A plain message if the web address can't be used, otherwise null. Mirrors the server's check. */
export function slugProblem(slug: string): string | null {
  if (!slug) {
    return 'Choose a web address for your site.';
  }
  if (!SLUG_RE.test(slug)) {
    return "Use 3 to 40 lowercase letters, numbers and dashes. It can't start or end with a dash.";
  }
  if (RESERVED.has(slug)) {
    return `"${slug}" is reserved. Choose a different web address.`;
  }
  return null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function suggestSlug(troop: Pick<Troop, 'name' | 'unitNumber'> | null): string {
  if (!troop) {
    return '';
  }
  const name = slugify(troop.name);
  return name.includes(slugify(troop.unitNumber)) ? name : slugify(`${troop.name} ${troop.unitNumber}`);
}

export function siteAddress(origin: string, slug: string): string {
  return `${origin}/s/${slug || 'your-troop'}`;
}

export function emptyDraft(troop: Troop | null): SiteDraft {
  return {
    slug: suggestSlug(troop),
    theme: { color: DEFAULT_COLOR, logoPath: null },
    cover: { heading: troop ? `${troop.name}` : '', tagline: '', photoPath: null },
    about: '',
    meeting: { schedule: '', place: '', address: null },
    faq: [],
    contacts: [],
    gallery: [],
    recruiting: { open: true, intro: '' },
  };
}

/** A complete draft from whatever is saved, so older or partial drafts still open in the editor. */
export function normalizeDraft(saved: Partial<SiteDraft> | null, troop: Troop | null): SiteDraft {
  const base = emptyDraft(troop);
  if (!saved) {
    return base;
  }
  return {
    slug: saved.slug ?? base.slug,
    theme: { ...base.theme, ...saved.theme },
    cover: { ...base.cover, ...saved.cover },
    about: saved.about ?? '',
    meeting: { ...base.meeting, ...saved.meeting },
    faq: saved.faq ?? [],
    contacts: saved.contacts ?? [],
    gallery: (saved.gallery ?? []).map((g) => ({ ...g, scoutIds: g.scoutIds ?? [], noScoutsShown: Boolean(g.noScoutsShown) })),
    recruiting: { ...base.recruiting, ...saved.recruiting },
  };
}

/** A message if the file can't be uploaded (wrong type or too big), otherwise null. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'Choose a PNG, JPEG, GIF or WebP image.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Images can be up to 8 MB. Choose a smaller one.';
  }
  return null;
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** Where a new upload goes: one flat draft folder per troop, with a unique name. */
export function uploadPath(troopId: string, kind: 'logo' | 'cover' | 'photo', type: string, unique: string): string {
  return `sites/${troopId}/draft/${kind}-${unique}.${EXTENSIONS[type] ?? 'img'}`;
}

export type ConsentState = 'granted' | 'withdrawn' | 'none';

export function consentState(member: Member | undefined): ConsentState {
  const consent = member?.mediaConsent;
  if (!consent) {
    return 'none';
  }
  return consent.granted ? 'granted' : 'withdrawn';
}

export const CONSENT_LABELS: Record<ConsentState, [string, 'good' | 'bad' | 'warn']> = {
  granted: ['Media consent given', 'good'],
  withdrawn: ['No media consent', 'bad'],
  none: ['Media consent not recorded', 'warn'],
};

/** Whether a gallery photo will be published, judged the way the server judges it. */
export function photoWillShow(item: GalleryItem, members: Member[]): boolean {
  if (item.noScoutsShown) {
    return true;
  }
  if (item.scoutIds.length === 0) {
    return false;
  }
  return item.scoutIds.every((id) => consentState(members.find((m) => m.id === id)) === 'granted');
}

/** Builder sections change the draft through this: a shallow patch of top-level fields, or a function of the
 * latest draft (for changes that land after an upload finishes). */
export type EditDraft = (patch: Partial<SiteDraft> | ((current: SiteDraft) => Partial<SiteDraft>)) => void;
