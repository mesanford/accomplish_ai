import { stillNeeded } from './formCheck';

/** Keep equal to ROLES in functions/handlers/pilot.py. */
export const PILOT_ROLES = [
  'Scoutmaster',
  'Advancement chair',
  'Other leader or committee member',
  'Parent or guardian',
  'Other',
] as const;

export interface PilotForm {
  name: string;
  email: string;
  unit: string;
  council: string;
  role: string;
  note: string;
  /** Hidden field that people leave empty; bots fill it in. */
  website: string;
}

export const EMPTY_PILOT: PilotForm = { name: '', email: '', unit: '', council: '', role: '', note: '', website: '' };

/** A plain message about what is missing or wrong, or null when the form can be sent. The server checks again. */
export function pilotProblem(form: PilotForm): string | null {
  const missing = stillNeeded([
    ['your name', form.name],
    ['your email', form.email],
    ['your troop or unit number', form.unit],
    ['your role', form.role],
  ]);
  if (missing) {
    return missing;
  }
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) ? null : 'Enter a valid email address.';
}
