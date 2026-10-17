import { LEADER_TROOP_TASKS } from './leaderTroop';
import type { RoleGuide } from './types';

/** Leader, Scoutmaster and advancement chair. More leader tasks are in leaderTroop.ts. */
export const LEADER_GUIDE: RoleGuide = {
  id: 'leader',
  title: "I'm a leader",
  sees: [
    'Everything on the Roster: every Scout, their parents and the adults.',
    'Blue cards, the Scoutbook report, path templates, troop awards and the activity report.',
    'Every event sign-up, the answers families gave and the health notes parents add.',
    'Every document, including ones set to leaders only.',
    'Join us requests and the draft of the troop website.',
    "The Equipment list, who has borrowed what, and each item's repair log.",
    'Scout accounts, if you are the Scoutmaster or advancement chair. You can look but not change them.',
  ],
  cannot: [
    'Change merit badge records, unless you are the Scoutmaster or advancement chair. Other leaders can see them and can sign ranks and troop awards.',
    'See Scout accounts, unless you are also the Scoutmaster, advancement chair or treasurer.',
    "Give permission for someone else's Scout to go to an event. Only a parent of that Scout can.",
    'Sign off requirements or post to Scouts without current Youth Protection training.',
  ],
  tasks: [
    {
      task: 'Set up the troop',
      steps: ['Open Roster.', 'Add each Scout with their birth month, year and current rank.', 'Invite parents with an invite link.', 'Use Events to add your next meeting or campout.'],
    },
    {
      task: 'Invite a parent or counselor',
      steps: ['Open Roster and find "Invite someone".', 'Choose their role and, for a parent, their Scout.', 'Press "Create invite link" and send the link by text or email.'],
    },
    {
      task: 'Add your own child, or link yourself to a Scout',
      steps: ['To add a new Scout, open Roster and tick "This is my child" in the Add a Scout form.', 'For a Scout already on the roster, open their page and press "I\'m this Scout\'s parent".', 'Read the parent notice and tick the box to agree. You keep your leader role.'],
    },
    {
      task: "Change someone's roles",
      steps: ['Open Roster and find the person under Adults.', 'Press "Change roles", tick the roles they hold, then press "Save roles".', 'For a parent, choose their Scouts. They agree to the parent notice the next time they open the troop.'],
    },
    {
      task: 'Make someone the Scoutmaster',
      steps: [
        'Open Roster and find the person under Adults.',
        'Press "Change roles" and tick Scoutmaster.',
        'Press "Save roles". A troop can have more than one Scoutmaster, and always keeps at least one Scoutmaster or advancement chair.',
      ],
    },
    {
      task: 'Approve a blue card',
      steps: [
        'Open Blue cards.',
        'Press Approve on a request.',
        'Choose a counselor and press Assign.',
        'Only the Scoutmaster and advancement chair can do this. Other leaders can see the list but not change it.',
      ],
    },
    {
      task: 'Know who can change merit badges',
      steps: [
        'The Scoutmaster and advancement chair can approve blue cards, record paper cards and earlier badges, and sign any merit badge requirement.',
        "A badge's counselor can sign requirements for that badge.",
        'Other leaders can see everything and can sign ranks and troop awards.',
      ],
    },
    {
      task: 'Share advancement with Scoutbook',
      steps: ['Open Scoutbook.', 'Make a report of what is new.', 'Type those items into Scoutbook, then mark the Scouts as entered.'],
    },
    ...LEADER_TROOP_TASKS,
  ],
};
