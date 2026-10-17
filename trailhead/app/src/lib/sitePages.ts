/** Custom pages for the troop website. Pages are structured data, never HTML; mirrors functions/handlers/site_pages.py. */
import { slugify } from './site';

export interface Span {
  text: string;
  href?: string;
}
export interface HeadingBlock {
  type: 'heading';
  text: string;
}
export interface ParagraphBlock {
  type: 'paragraph';
  inline: Span[];
}
export interface ListBlock {
  type: 'list';
  /** Each item wraps its spans in an object, because Firestore cannot store a list directly inside a list. */
  items: { inline: Span[] }[];
}
export interface ImageBlock {
  type: 'image';
  path: string;
  alt: string;
  scoutIds: string[];
  noScoutsShown: boolean;
}
export type Block = HeadingBlock | ParagraphBlock | ListBlock | ImageBlock;
export interface DraftPage {
  id: string;
  title: string;
  slug: string;
  blocks: Block[];
}

/** What the public site holds: images have a public url and no Scout tags. */
export type PublicBlock =
  HeadingBlock | ParagraphBlock | ListBlock | { type: 'image'; url: string; alt: string };
export interface PublicPage {
  id: string;
  title: string;
  slug: string;
  blocks: PublicBlock[];
}

export const PAGE_LIMITS = {
  pages: 10,
  blocks: 40,
  images: 12,
  title: 60,
  heading: 120,
  paragraph: 1500,
  item: 300,
  items: 20,
};
const PAGE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const RESERVED_PAGE_SLUGS = new Set(['calendar', 'documents', 'home', 'index']);
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** The link if it is an http, https or mailto address; anything else (javascript:, data:, a bare path) is dropped. */
export function safeHref(url: string | undefined | null): string | null {
  if (!url || url.length > 500 || /[\s\u0000-\u001f\u007f]/.test(url)) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'mailto:') {
      return parsed.pathname.includes('@') ? url : null;
    }
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Turns "Read the [guide](https://example.com)" into spans. A link with an unsafe address stays plain text. */
export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const href = safeHref(match[2]);
    if (!href) {
      continue;
    }
    if (match.index > last) {
      spans.push({ text: text.slice(last, match.index) });
    }
    spans.push({ text: match[1], href });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    spans.push({ text: text.slice(last) });
  }
  return spans;
}

export function formatInline(spans: Span[]): string {
  return spans.map((s) => (s.href ? `[${s.text}](${s.href})` : s.text)).join('');
}

export const listToText = (items: ListBlock['items']): string =>
  items.map((i) => formatInline(i.inline)).join('\n');
/** One item per line. Blank lines stay while typing; the server drops them when it publishes. */
export const textToList = (text: string): ListBlock['items'] =>
  text.split('\n').map((line) => ({ inline: parseInline(line) }));

export function newPage(existing: DraftPage[], now = Date.now()): DraftPage {
  const id = `p${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  let n = existing.length + 1;
  while (existing.some((p) => p.slug === `page-${n}`)) {
    n += 1;
  }
  return { id, title: `Page ${n}`, slug: `page-${n}`, blocks: [] };
}

export function pageSlug(title: string): string {
  return slugify(title);
}

/** A plain message if the page can't be published as it is, otherwise null. Mirrors the server's check. */
export function pageProblem(page: DraftPage, all: DraftPage[]): string | null {
  if (!page.title.trim()) {
    return 'Give this page a title.';
  }
  if (!PAGE_SLUG_RE.test(page.slug)) {
    return "Use 1 to 40 lowercase letters, numbers and dashes. The address can't start or end with a dash.";
  }
  if (RESERVED_PAGE_SLUGS.has(page.slug)) {
    return `"${page.slug}" is used by the site already. Choose a different address.`;
  }
  if (all.filter((p) => p.slug === page.slug).length > 1) {
    return 'Another page already uses this address.';
  }
  if (page.blocks.length > PAGE_LIMITS.blocks) {
    return `A page can have up to ${PAGE_LIMITS.blocks} blocks.`;
  }
  if (page.blocks.filter((b) => b.type === 'image').length > PAGE_LIMITS.images) {
    return `A page can have up to ${PAGE_LIMITS.images} images.`;
  }
  return null;
}

/** Moves item `from` to `to`, keeping the rest in order. Out-of-range moves change nothing. */
export function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function pageAddress(origin: string, siteSlug: string, pageSlug_: string): string {
  return `${origin}/s/${siteSlug || 'your-troop'}/${pageSlug_}`;
}
