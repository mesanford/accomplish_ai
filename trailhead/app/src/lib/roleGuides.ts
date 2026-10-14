/** Step-by-step walkthroughs for each kind of person using Trailhead, shown on the Help page. */

export interface GuideTask {
  task: string;
  steps: string[];
}

export interface RoleGuide {
  id: string;
  title: string;
  tasks: GuideTask[];
}

export const ROLE_GUIDES: RoleGuide[] = [
  {
    id: 'leader',
    title: "I'm a leader",
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
        task: 'Approve a blue card',
        steps: ['Open Blue cards.', 'Press Approve on a request.', 'Choose a counselor and press Assign.'],
      },
      {
        task: 'Take attendance',
        steps: ['Open Events and add or open an event.', 'Press Attendance.', 'Tick each Scout who came.'],
      },
      {
        task: 'Share advancement with Scoutbook',
        steps: ['Open Scoutbook.', 'Make a report of what is new.', 'Type those items into Scoutbook, then mark the Scouts as entered.'],
      },
    ],
  },
  {
    id: 'parent',
    title: "I'm a parent",
    tasks: [
      {
        task: 'Find or add your Scout',
        steps: ['Open Home. Your Scouts are listed there.', 'If yours is missing, use "Add your Scout" at the bottom.'],
      },
      {
        task: 'Plan a path',
        steps: ['Open your Scout from Home.', 'Press "Plan a path".', 'Pick a goal, such as Eagle, and add merit badges.', 'Check the notes about whether it will work, then Save plan.'],
      },
      {
        task: 'Start a merit badge',
        steps: ['Open Badges and search for the badge.', 'Press "Start a blue card".', 'A leader approves it and assigns a counselor.'],
      },
    ],
  },
  {
    id: 'scout',
    title: "I'm a Scout",
    tasks: [
      {
        task: 'See my progress',
        steps: ['Open Home and tap your name.', 'You will see your rank, plan and badges.'],
      },
      {
        task: 'Start a merit badge',
        steps: ['Open Badges and find one you like.', 'Press "Start a blue card".', 'Ask your Scoutmaster to approve it.', 'Then call your counselor to set up a first meeting.'],
      },
    ],
  },
  {
    id: 'counselor',
    title: "I'm a merit badge counselor",
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
  },
];
