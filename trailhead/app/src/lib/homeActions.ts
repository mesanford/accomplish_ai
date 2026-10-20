// The home screen's "What do you want to do?" choices, by what the person can do in the troop.

export interface HomeAction {
  key: string;
  label: string;
  hint: string;
  /** A path inside the troop, such as "events" or "announcements?new=1". "#scouts" scrolls to the Scouts below. */
  to: string;
}

export interface Who {
  isLeader: boolean;
  /** Leaders and committee members post announcements. */
  canPost: boolean;
  counselor: boolean;
  parent: boolean;
  /** Treasurer, Scoutmaster or advancement chair: the Accounts page. */
  accounts: boolean;
}

const A = {
  event: { key: 'event', label: 'Plan an event', hint: 'A campout, service day or a weekly meeting', to: 'events' },
  message: { key: 'message', label: 'Send a message to the troop', hint: 'Post now or schedule it, and email families', to: 'announcements?new=1' },
  scouts: { key: 'scouts', label: 'Manage Scouts and families', hint: 'Add Scouts, invite parents, change roles', to: 'roster' },
  advance: { key: 'advance', label: 'Help a Scout advance', hint: 'Plan a path to the next rank or sign off requirements', to: '#scouts' },
  cards: { key: 'cards', label: 'Blue cards', hint: 'Approve merit badges and assign counselors', to: 'blue-cards' },
  attendance: { key: 'attendance', label: 'Take attendance', hint: 'Open an event and tick who came', to: 'events' },
  settings: { key: 'settings', label: 'Troop settings', hint: 'Details, meeting place, time zone, leadership', to: 'settings' },
  counseling: { key: 'counseling', label: 'Your merit badge Scouts', hint: 'Sign off requirements you counsel', to: 'counseling' },
  signup: { key: 'signup', label: 'Sign up for an event', hint: 'See what is coming up and who is going', to: 'events' },
  path: { key: 'path', label: "See your Scout's progress", hint: 'Their path, badges and blue cards', to: '#scouts' },
  leader: { key: 'leader', label: 'Message a leader', hint: 'Every conversation includes a second adult', to: 'messages' },
  health: { key: 'health', label: 'Health forms', hint: 'Record or check annual health forms', to: 'health' },
  accounts: { key: 'accounts', label: 'Scout accounts', hint: 'Balances, payments and fundraisers', to: 'accounts' },
} satisfies Record<string, HomeAction>;

/** Up to eight choices, the most common first. */
export function homeActions(who: Who): HomeAction[] {
  const out: HomeAction[] = [];
  if (who.isLeader) {
    out.push(A.event, A.message, A.scouts, A.advance, A.cards, A.attendance);
  } else {
    if (who.parent) {
      out.push(A.signup, A.path, A.leader, A.health);
    }
    if (who.canPost) {
      out.push(A.message);
    }
  }
  if (who.counselor) {
    out.push(A.counseling);
  }
  if (who.accounts) {
    out.push(A.accounts);
  }
  if (who.isLeader) {
    out.push(A.settings);
  }
  if (out.length === 0) {
    out.push(A.signup, A.leader);
  }
  return [...new Map(out.map((a) => [a.key, a])).values()].slice(0, 8);
}
