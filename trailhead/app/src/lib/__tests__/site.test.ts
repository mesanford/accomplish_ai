import { describe, expect, it } from 'vitest';
import {
  consentState,
  emptyDraft,
  type GalleryItem,
  imageProblem,
  normalizeDraft,
  photoWillShow,
  siteAddress,
  slugify,
  type SiteDraft,
  slugProblem,
  suggestSlug,
  tagsWillShow,
  uploadPath,
} from '../site';
import type { Member } from '../types';

const troop = { name: 'Troop 101 Springfield', unitNumber: '101' };
const scout = (id: string, granted?: boolean): Member => ({
  id,
  kind: 'scout',
  displayName: id,
  ...(granted === undefined ? {} : { mediaConsent: { granted, byMemberId: 'm-parent' } }),
});

describe('web address', () => {
  it('accepts the same slugs as the server', () => {
    expect(slugProblem('troop-101-springfield')).toBeNull();
    expect(slugProblem('abc')).toBeNull();
    expect(slugProblem('')).toMatch(/Choose a web address/);
    expect(slugProblem('ab')).toMatch(/3 to 40/);
    expect(slugProblem('-troop')).toMatch(/dash/);
    expect(slugProblem('Troop-101')).toMatch(/lowercase/);
    expect(slugProblem('a'.repeat(41))).toMatch(/3 to 40/);
    expect(slugProblem('admin')).toMatch(/reserved/);
  });

  it('suggests a slug from the troop name and number', () => {
    expect(slugify('  Troop #101 — Springfield, IL ')).toBe('troop-101-springfield-il');
    expect(slugify('Café Scouts')).toBe('cafe-scouts');
    expect(suggestSlug(troop)).toBe('troop-101-springfield');
    expect(suggestSlug({ name: 'Eagle Ridge', unitNumber: '42' })).toBe('eagle-ridge-42');
    expect(suggestSlug(null)).toBe('');
    expect(slugProblem(slugify('x'.repeat(39) + ' y'))).toBeNull();
  });

  it('previews the address', () => {
    expect(siteAddress('https://trailhead.app', 'troop-101')).toBe('https://trailhead.app/s/troop-101');
    expect(siteAddress('https://trailhead.app', '')).toBe('https://trailhead.app/s/your-troop');
  });
});

describe('drafts', () => {
  it('starts from the troop and fills gaps in saved drafts', () => {
    const fresh = emptyDraft(troop);
    expect(fresh.slug).toBe('troop-101-springfield');
    expect(fresh.cover.heading).toBe('Troop 101 Springfield');
    const partial = normalizeDraft(
      { slug: 'mine', about: 'Hi', gallery: [{ path: 'p', caption: '' } as GalleryItem] },
      troop,
    );
    expect(partial.slug).toBe('mine');
    expect(partial.meeting).toEqual({ schedule: '', place: '', address: null });
    expect(partial.gallery[0]).toEqual({ path: 'p', caption: '', scoutIds: [], noScoutsShown: false });
    expect(normalizeDraft(null, null).slug).toBe('');
  });
});

describe('images', () => {
  it('allows images up to 8 MB', () => {
    expect(imageProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(imageProblem({ type: 'application/pdf', size: 1000 })).toMatch(/PNG, JPEG/);
    expect(imageProblem({ type: 'image/jpeg', size: 9 * 1024 * 1024 })).toMatch(/8 MB/);
  });

  it('puts uploads in the troop draft folder with a unique name', () => {
    expect(uploadPath('t1', 'photo', 'image/jpeg', '123-abc')).toBe('sites/t1/draft/photo-123-abc.jpg');
    expect(uploadPath('t1', 'logo', 'image/png', 'x')).toBe('sites/t1/draft/logo-x.png');
  });
});

describe('media consent', () => {
  it('reads consent state', () => {
    expect(consentState(scout('a', true))).toBe('granted');
    expect(consentState(scout('a', false))).toBe('withdrawn');
    expect(consentState(scout('a'))).toBe('none');
    expect(consentState(undefined)).toBe('none');
  });

  it('predicts which photos publish, like the server', () => {
    const members = [scout('yes', true), scout('no', false), scout('unknown')];
    const photo = (scoutIds: string[], noScoutsShown = false) => ({ path: 'p', caption: '', scoutIds, noScoutsShown });
    expect(photoWillShow(photo(['yes']), members)).toBe(true);
    expect(photoWillShow(photo(['yes', 'no']), members)).toBe(false);
    expect(photoWillShow(photo(['unknown']), members)).toBe(false);
    expect(photoWillShow(photo([]), members)).toBe(false);
    expect(photoWillShow(photo(['no'], true), members)).toBe(true);
  });

  it('applies the same rule to the cover photo and logo tags', () => {
    const members = [scout('yes', true), scout('no', false)];
    const fresh = emptyDraft(troop);
    expect(fresh.cover.photoNoScoutsShown).toBe(false);
    expect(tagsWillShow({ scoutIds: fresh.cover.photoScoutIds, noScoutsShown: fresh.cover.photoNoScoutsShown }, members)).toBe(false);
    expect(tagsWillShow({ scoutIds: ['yes'], noScoutsShown: false }, members)).toBe(true);
    expect(tagsWillShow({ scoutIds: ['yes', 'no'], noScoutsShown: false }, members)).toBe(false);
    expect(tagsWillShow({ scoutIds: [], noScoutsShown: true }, members)).toBe(true);
    const older = normalizeDraft({ cover: { heading: 'H', tagline: '', photoPath: 'p' } as SiteDraft['cover'] }, troop);
    expect(older.cover.photoScoutIds).toEqual([]);
    expect(older.theme.logoNoScoutsShown).toBe(false);
  });
});
