// Drive time from the troop's meeting place to a place on a Google Maps link (functions/endpoints/drive_time.py).
// A typical-conditions estimate from OpenRouteService (OpenStreetMap data), with no live traffic.
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export const DRIVE_CREDIT = 'Estimate by openrouteservice.org · © OpenStreetMap contributors';

export async function estimateDriveTime(
  troopId: string,
  planId: string,
  mapsUrl: string,
): Promise<{ minutes: number; miles: number }> {
  const call = httpsCallable<{ troopId: string; planId: string; mapsUrl: string }, { minutes: number; miles: number }>(
    functions,
    'estimate_drive_time',
  );
  return (await call({ troopId, planId, mapsUrl: mapsUrl.trim() })).data;
}

/** A Google Maps page or short link over https, as the server accepts; anything else is never sent. */
export function isMapsLink(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') {
      return false;
    }
    if (host === 'maps.app.goo.gl' || host === 'goo.gl') {
      return true;
    }
    return ['google.com', 'www.google.com', 'maps.google.com'].includes(host) && url.pathname.startsWith('/maps');
  } catch {
    return false;
  }
}
