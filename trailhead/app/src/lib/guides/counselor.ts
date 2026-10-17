import type { RoleGuide } from './types';

export const COUNSELOR_GUIDE: RoleGuide = {
  id: 'counselor',
  title: "I'm a merit badge counselor",
  sees: [
    'The Counseling page: each Scout assigned to you, with the badge and their progress on it.',
    'The blue cards assigned to you.',
    'The things every troop member sees: Home, Events, Badges, announcements sent to you and Documents shared with members.',
  ],
  cannot: [
    'See the Roster, other Scouts, Scout accounts or health notes.',
    'Approve a blue card or assign a counselor. The Scoutmaster and advancement chair do that.',
    'Sign off a badge that is not assigned to you, or any rank.',
    'Sign anything without current Youth Protection training. Ask a leader to add the date.',
  ],
  tasks: [
    {
      task: 'See my Scouts',
      steps: ['Open Counseling.', 'Each Scout assigned to you is listed with the badge.'],
    },
    {
      task: 'Sign off requirements',
      steps: ['Open Counseling and press "Start working with this Scout".', 'Press the Sign button next to each requirement the Scout has finished.', 'When all are done, press "Mark complete".'],
    },
  ],
};
