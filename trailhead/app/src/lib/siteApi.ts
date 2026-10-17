import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

async function call<In, Out>(name: string, data: In): Promise<Out> {
  const result = await httpsCallable<In, Out>(functions, name)(data);
  return result.data;
}

export interface LeftOutPhoto {
  path: string;
  caption: string;
  reason: string;
  /** What was left out: a gallery photo, the cover photo or the logo. */
  kind?: 'photo' | 'cover' | 'logo' | 'page' | 'document';
}

export interface PublishResult {
  url: string;
  slug: string;
  leftOut: LeftOutPhoto[];
}

export const publishSite = (troopId: string) => call<{ troopId: string }, PublishResult>('publish_site', { troopId });

export const unpublishSite = (troopId: string) =>
  call<{ troopId: string }, { published: boolean }>('unpublish_site', { troopId });

export const draftSiteAbout = (troopId: string, notes: string) =>
  call<{ troopId: string; notes: string }, { about: string }>('draft_site_about', { troopId, notes });

export interface ConsentForm {
  troopId: string;
  scoutId: string;
  granted: boolean;
}

export const setMediaConsent = (form: ConsentForm) =>
  call<ConsentForm, { granted: boolean; photosRemoved: number }>('set_media_consent', form);
