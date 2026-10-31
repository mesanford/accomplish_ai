// The place catalog (top-level `places`, refreshed by the refresh_places job): campgrounds, state parks and high
// adventure bases from public sources. find_places ranks them for a plan (functions/endpoints/places_find.py).
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type PlaceKind = 'federal' | 'statePark' | 'highAdventure';
/** yes: a campground; nearby: a campground is mapped close by (it may not be the park's); check: unknown. */
export type Camping = 'yes' | 'nearby' | 'check';

export interface PlaceFact {
  label: 'ages' | 'crewSize' | 'season' | 'cost' | 'booking' | 'requirements';
  value: string;
  /** The program page's own words. */
  quote: string;
}

export interface PlaceRow {
  id: string;
  name: string;
  kind: PlaceKind;
  state: string;
  lat: number;
  lng: number;
  url: string | null;
  bookingUrl: string | null;
  camping: Camping;
  description: string;
  /** Where the record came from, as that source asks to be credited. */
  credit: string;
  facts?: PlaceFact[];
  /** When a high adventure program's page was last read. */
  checkedOn?: string | null;
  /** Straight-line miles from the meeting place, when it is known. */
  miles: number | null;
  /** Driving minutes from OpenRouteService, for the closest places. */
  driveMinutes?: number | null;
}

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  federal: 'Federal campground',
  statePark: 'State park',
  highAdventure: 'High adventure base',
};
export const CAMPING_TEXT: Record<Camping, string> = {
  yes: 'Campground',
  nearby: "A campground is mapped nearby. Check the park's page.",
  check: "Check the park's page for camping.",
};
export const FACT_LABELS: Record<PlaceFact['label'], string> = {
  ages: 'Ages',
  crewSize: 'Crew size',
  season: 'Season',
  cost: 'Cost',
  booking: 'Booking',
  requirements: 'Requirements',
};

export async function findPlaces(
  troopId: string,
  planId: string,
  mode: 'nearby' | 'highAdventure',
): Promise<{ places: PlaceRow[]; nearYou: boolean }> {
  const call = httpsCallable<object, { places: PlaceRow[]; nearYou: boolean }>(functions, 'find_places');
  return (await call({ troopId, planId, mode })).data;
}

/** A Google Maps link to the place's location, for the research card. */
export function mapsLinkFor(p: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}
