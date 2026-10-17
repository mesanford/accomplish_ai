import type { GuideTask } from './types';

/** More leader tasks: events, patrols, activity logs, announcements, the website, documents and roles. */
export const LEADER_TROOP_TASKS: GuideTask[] = [
  {
    task: 'Take attendance',
    steps: ['Open Events and add or open an event.', 'Press Attendance.', 'Tick each Scout who came.'],
  },
  {
    task: 'Open sign-ups for an event',
    steps: [
      'Open the event and find "Event settings and sign-ups".',
      'Tick "Turn on sign-ups". Choose who can sign up, the number of spots and a sign-up deadline.',
      'Tick "A parent must give permission for each Scout" if you want that. Add up to six questions for families.',
      'Enter a fee per Scout if there is one. The treasurer charges it.',
      'Save. Families then see a Sign up section on the event.',
    ],
  },
  {
    task: 'Manage the waitlist and permission',
    steps: [
      'When all spots are taken, the next people go on a waitlist. The first person waiting moves up when someone cancels, and gets an email.',
      'A Scout waiting for permission keeps their spot. Only a parent of that Scout can give permission, not a leader.',
      'In the Roster section of the event you can add or remove people, and close or reopen sign-ups.',
      'Health notes parents add show next to their Scout. Only leaders can read them. Families cannot read them back.',
    ],
  },
  {
    task: 'Log camping nights, service hours and miles',
    steps: [
      'Open the event and find "Activity log".',
      'Enter the nights, miles or service hours, then take attendance.',
      'Each Scout marked present gets those numbers on their record.',
      "A parent or Scout can also add an entry on the Scout's page. It waits for you to approve or reject it, and does not count until you do.",
      'Open Activity report to see the service hours for the year.',
    ],
  },
  {
    task: 'Set up patrols',
    steps: [
      'Open Patrols.',
      'Add a patrol with a name and an optional color.',
      'Add Scouts to it. Each Scout is in one patrol.',
      'Choose a patrol leader and an assistant from its Scouts, then save.',
    ],
  },
  {
    task: 'Post an announcement or a newsletter',
    steps: [
      'Open Announcements and press "New announcement".',
      'Choose Announcement or Newsletter. A newsletter can have up to six sections and link up to ten events.',
      'Choose who it is for: the troop, parents, adults, leaders, parents of chosen Scouts, parents of a patrol, or everyone signed up for an event.',
      'Tick "Pin to the top" or the email box if you want. Scouts are never emailed. A troop can email five a day.',
      'To reach Scouts you need current Youth Protection training. The poster or a Scoutmaster can edit, pin or delete a post.',
    ],
  },
  {
    task: 'Build the troop website',
    steps: [
      'Open Website and choose your web address.',
      'Fill in the sections, such as cover, about, meeting, questions and contacts. Add extra pages with headings, text, lists and images.',
      'Documents you set to public are listed on the site. Events marked "Show on the public website" appear on its calendar.',
      'Press Save draft, then Publish. Only leaders see a draft. You can unpublish any time.',
    ],
  },
  {
    task: 'Share documents',
    steps: [
      'Open Documents, choose a file and a category, and press "Add document".',
      'Choose who can see it: the public, members, or leaders only.',
      'Medical forms are never public. Older Word (.doc) files cannot be public either.',
    ],
  },
  {
    task: 'Give someone the treasurer or quartermaster role',
    steps: [
      'For an adult, open Roster, find them under Adults, press "Change roles", tick Treasurer or Quartermaster and save.',
      'For a new adult, choose the role when you make their invite link.',
      'For a Scout 13 or older with their own sign-in, press "Make (name) quartermaster" next to them on the Roster.',
      'These roles do not change advancement.',
    ],
  },
  {
    task: 'Mark a Scout as left the troop',
    steps: [
      "Open the Scout's page and press \"Mark (name) as left the troop\".",
      'Their records are kept for 12 months, then deleted.',
      "If the Scout has a balance, the treasurer settles it from the Scout's account page.",
    ],
  },
];
