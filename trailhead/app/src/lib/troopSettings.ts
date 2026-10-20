// Troop settings: the form a leader saves (save_troop_settings), and who holds each leadership role.
import type { TroopSettingsForm } from './api';
import { DEFAULT_ZONE } from './timeZones';
import type { Member, Role, Troop } from './types';

export const EMPTY_PLACE = { place: '', street: '', city: '', state: '', zip: '' };

/** Every setting, from the saved troop. Each part of the page saves this with its own changes on top. */
export function settingsFrom(troopId: string, troop: Troop | null): TroopSettingsForm {
  return {
    troopId,
    name: troop?.name ?? '',
    unitNumber: troop?.unitNumber ?? '',
    council: troop?.council ?? '',
    district: troop?.district ?? '',
    charterOrg: troop?.charterOrg ?? '',
    meetingPlace: { ...EMPTY_PLACE, ...troop?.meetingPlace },
    timezone: troop?.timezone || DEFAULT_ZONE,
    positions: { committeeChair: troop?.positions?.committeeChair ?? null, charterRep: troop?.positions?.charterRep ?? null },
  };
}

/** The roles shown in the leadership summary, most senior first. */
export const LEADERSHIP_ROLES: [Role, string][] = [
  ['scoutmaster', 'Scoutmaster'],
  ['leader', 'Leaders'],
  ['advancement', 'Advancement chair'],
  ['committee', 'Committee'],
  ['treasurer', 'Treasurer'],
  ['quartermaster', 'Quartermaster'],
  ['counselor', 'Merit badge counselors'],
];

/** For each leadership role, the names of the adults who hold it. */
export function whoHolds(members: Member[]): { role: Role; label: string; names: string[] }[] {
  const adults = members.filter((m) => m.kind === 'adult').sort((a, b) => a.displayName.localeCompare(b.displayName));
  return LEADERSHIP_ROLES.map(([role, label]) => ({
    role,
    label,
    names: adults.filter((a) => (a.roles ?? []).includes(role)).map((a) => a.displayName),
  }));
}

/** What a troop is missing that the app needs, in plain words. */
export function leadershipGaps(members: Member[]): string[] {
  const held = new Set(members.filter((m) => m.kind === 'adult').flatMap((m) => m.roles ?? []));
  const gaps: string[] = [];
  if (!held.has('scoutmaster')) {
    gaps.push('No one is the Scoutmaster yet.');
  }
  if (!held.has('scoutmaster') && !held.has('advancement')) {
    gaps.push('No one can manage merit badges: make someone the Scoutmaster or advancement chair.');
  }
  return gaps;
}

/** "Church hall, 1 Main St, Springfield, IL 62701", skipping empty parts. */
export function addressLine(p: Partial<typeof EMPTY_PLACE> | undefined): string {
  const stateZip = [p?.state, p?.zip].filter(Boolean).join(' ');
  return [p?.place, p?.street, p?.city, stateZip].filter(Boolean).join(', ');
}
