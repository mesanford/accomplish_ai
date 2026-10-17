/**
 * A troop's own domain (for example troop101springfield.org). The server's `site_shell` function puts
 * `<meta name="forthright-site" content="{slug}">` in the page it serves on such a domain; the app reads it to
 * show that troop's site at "/" without the sign-in pages.
 */
const FORTHRIGHT = 'https://forthrightapp.com';

/** The troop slug named by the marker in `doc`, or null on Forthright's own addresses. */
export function readSiteMarker(doc: Pick<Document, 'querySelector'>): string | null {
  const content = doc.querySelector<HTMLMetaElement>('meta[name="forthright-site"]')?.content?.trim().toLowerCase();
  return content || null;
}

/** The slug when this page is a troop's own domain. */
export function troopDomainSlug(): string | null {
  return typeof document === 'undefined' ? null : readSiteMarker(document);
}

/** Where a troop site's pages live: `/s/{slug}` on Forthright, the root on the troop's own domain. */
export function siteBase(slug: string, onOwnDomain = troopDomainSlug() !== null): string {
  return onOwnDomain ? '' : `/s/${slug}`;
}

/** A link to Forthright itself. On a troop's own domain it must leave the domain. */
export function forthrightUrl(path = '/', onOwnDomain = troopDomainSlug() !== null): string {
  return onOwnDomain ? `${FORTHRIGHT}${path}` : path;
}
