import type { RoleGuide } from './types';

/** Committee members can read the troop and post announcements. They change no records. */
export const COMMITTEE_GUIDE: RoleGuide = {
  id: 'committee',
  title: "I'm a committee member",
  sees: [
    'Home, Events, Badges, Announcements, Documents shared with members, and the Equipment list.',
    'Event sign-ups for yourself and your own family.',
  ],
  cannot: [
    'See the Roster, blue cards, Scout accounts or health notes.',
    'Change advancement records, accounts or Equipment.',
    'Edit or delete a post that someone else wrote. A Scoutmaster can.',
  ],
  tasks: [
    {
      task: 'Post an announcement or newsletter',
      steps: [
        'Open Announcements and press "New announcement".',
        'Write it and choose who it is for.',
        'To reach Scouts you need current Youth Protection training. Add the date when a leader gives you the role.',
        'Scouts are never emailed.',
      ],
    },
    {
      task: 'Get more access',
      steps: [
        'Ask a leader to press "Change roles" on the Roster and add the role you need.',
        'One person can hold several roles. Your pages show what all your roles allow.',
      ],
    },
  ],
};
