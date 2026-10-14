/** Pure helpers for guidance: remembering what a person hid, and working out the Getting started checklists. */

const PREFIX = 'trailhead.hide.';

/** localStorage can be missing or throw (private windows, blocked site data). Never let that break a page. */
export function readHidden(key: string, storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const s = storage ?? window.localStorage;
    return s.getItem(PREFIX + key) === '1';
  } catch {
    return false;
  }
}

export function writeHidden(key: string, hidden: boolean, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    const s = storage ?? window.localStorage;
    if (hidden) {
      s.setItem(PREFIX + key, '1');
    } else {
      s.removeItem(PREFIX + key);
    }
  } catch {
    // Not remembered, but the page still works for this visit.
  }
}

export interface ChecklistItem {
  id: string;
  label: string;
  hint: string;
  to: string;
  done: boolean;
}

export interface LeaderData {
  scouts: number;
  parents: number;
  counselors: number;
  events: number;
  published: boolean;
  paths: number;
}

export interface FamilyData {
  scouts: number;
  paths: number;
  blueCards: number;
}

export function leaderChecklist(base: string, d: LeaderData): ChecklistItem[] {
  return [
    { id: 'scouts', label: 'Add your Scouts', hint: 'Start with a name, birth month and year, and current rank.', to: `${base}/roster`, done: d.scouts > 0 },
    { id: 'parents', label: 'Invite parents', hint: 'Send each family a private link so they can follow their Scout.', to: `${base}/roster`, done: d.parents > 0 },
    { id: 'counselors', label: 'Invite a merit badge counselor', hint: 'Counselors sign off merit badge requirements.', to: `${base}/roster`, done: d.counselors > 0 },
    { id: 'events', label: 'Add an event', hint: 'A meeting or campout. You can take attendance there.', to: `${base}/events`, done: d.events > 0 },
    { id: 'website', label: 'Publish your troop website', hint: 'A simple public page that helps new families find you.', to: `${base}/website`, done: d.published },
    { id: 'paths', label: "Plan a Scout's path", hint: 'Pick a goal like Eagle and see if the dates work.', to: `${base}/roster`, done: d.paths > 0 },
  ];
}

export function parentChecklist(base: string, d: FamilyData): ChecklistItem[] {
  return [
    { id: 'scout', label: 'Add or find your Scout', hint: 'Your Scout should be listed under "Your Scouts". If not, add them.', to: base, done: d.scouts > 0 },
    { id: 'path', label: 'Plan a path', hint: 'Open your Scout and press "Plan a path" to set a goal.', to: base, done: d.paths > 0 },
    { id: 'card', label: 'Start a blue card', hint: 'Pick a merit badge on the Badges page.', to: `${base}/badges`, done: d.blueCards > 0 },
  ];
}

export function progress(items: ChecklistItem[]): { done: number; total: number; complete: boolean } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: done === items.length };
}
