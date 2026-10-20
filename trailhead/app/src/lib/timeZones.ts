// The time zones a troop can pick. Keep in step with functions/handlers/time_zones.py.

export const DEFAULT_ZONE = 'America/Chicago';

export const ZONES: [string, string][] = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona (no daylight saving)'],
  ['America/Los_Angeles', 'Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Puerto_Rico', 'Atlantic (Puerto Rico, U.S. Virgin Islands)'],
  ['Pacific/Guam', 'Chamorro (Guam, Northern Mariana Islands)'],
  ['Europe/London', 'United Kingdom'],
  ['Europe/Berlin', 'Central Europe'],
  ['Asia/Seoul', 'Korea'],
  ['Asia/Tokyo', 'Japan'],
];

/** The name shown for a zone, such as "Pacific". */
export function zoneLabel(zone: string | undefined): string {
  return ZONES.find(([id]) => id === (zone || DEFAULT_ZONE))?.[1] ?? 'Central';
}

/** The browser's own zone if a troop can pick it, else Central. `found` is for tests. */
export function browserZone(found?: string): string {
  let zone = found;
  if (zone === undefined) {
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      zone = '';
    }
  }
  return ZONES.some(([id]) => id === zone) ? (zone as string) : DEFAULT_ZONE;
}
