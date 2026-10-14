/**
 * All guidance copy lives here so it can be read and improved in one place.
 * Written for busy volunteers who may not know Scouting words or app habits:
 * short sentences, say what happens and why it matters.
 */
export interface HelpEntry {
  title: string;
  body: string;
  /** Only scouting.org pages. */
  learnMore?: string;
}

export const HELP = {
  blueCard: {
    title: 'Blue card',
    body: 'The Application for Merit Badge, a paper form. In Trailhead it is a request a leader approves, then a counselor is assigned. A Scout needs one before starting a merit badge.',
    learnMore: 'https://www.scouting.org/skills/merit-badges/',
  },
  boardOfReview: {
    title: 'Board of review',
    body: 'A short meeting where a few adults talk with a Scout about their experience. It is the last step for every rank. It is not a test.',
    learnMore: 'https://www.scouting.org/resources/guide-to-advancement/',
  },
  scoutmasterConference: {
    title: 'Scoutmaster conference',
    body: 'A one-on-one talk between a Scout and the Scoutmaster. It happens before the board of review for each rank.',
  },
  positionOfResponsibility: {
    title: 'Position of responsibility',
    body: 'A troop job, such as patrol leader or scribe. Star, Life and Eagle each need months in one of these jobs.',
  },
  eagleRequired: {
    title: 'Eagle-required',
    body: 'Some merit badges must be earned to reach Eagle. Others are optional. Badges marked Eagle-required count toward that list.',
    learnMore: 'https://www.scouting.org/skills/merit-badges/eagle-required/',
  },
  partial: {
    title: 'Partials',
    body: 'A merit badge a Scout started but did not finish. Requirements already signed off stay on record, so the work is not lost when they pick it up again.',
  },
  ypt: {
    title: 'Youth Protection training (YPT)',
    body: 'Every adult working with Scouts takes this short online course. It expires after two years. We only record the date it runs out, so we can remind you in time.',
    learnMore: 'https://www.scouting.org/training/youth-protection/',
  },
  yptMessages: {
    title: 'Why a parent is copied',
    body: 'Scouting rules say adults must not be alone in private messages with a youth. So when a leader writes to a Scout, a parent is added automatically.',
  },
  pathFeasibility: {
    title: 'Will this plan work?',
    body: 'Trailhead checks your plan against the real rules: how long each rank takes, required badges and age limits. "On track" means the dates work. "Won\'t work as planned" means something has to change. The notes below say what.',
  },
  pathPlan: {
    title: 'What is a plan?',
    body: 'A plan is the list of ranks and merit badges a Scout wants to finish, with dates. It is only a guide. You can change it any time.',
  },
  draftWithAi: {
    title: 'Draft with AI',
    body: 'Describe a goal in plain words and the AI suggests a plan. Nothing is saved yet. The rules check every suggestion first, and you decide whether to keep it.',
  },
  pathTemplate: {
    title: 'Path template',
    body: 'A ready-made plan you can reuse, like "Eagle by 17". Applying one fills in a Scout\'s plan with dates counted from today. You can change it afterward.',
  },
  priorAdvancement: {
    title: 'Earlier ranks and badges',
    body: 'Use this for what a Scout earned before joining Trailhead. Enter the date each was earned. Trailhead then knows what is already done and plans only what is left.',
  },
  signOff: {
    title: 'Sign-off',
    body: 'Marking a requirement as done by an approved adult. It records who signed and when. Only counselors and leaders can sign off.',
  },
  attendance: {
    title: 'Attendance',
    body: "Tick who came to an event. If the event has camping nights, miles or service hours, they are added to each present Scout's record for their requirements.",
  },
  publicEvent: {
    title: 'Show on the public website',
    body: 'If ticked, the title, date and place of this event appear on your troop website for anyone to see. Nothing else is shown.',
  },
  invite: {
    title: 'Invite link',
    body: 'A private web address for one person. Send it by text or email. When they open it and sign in, they join your troop with the role you chose. It works once and expires in 30 days.',
  },
  roles: {
    title: 'Who can do what',
    body: 'Leaders and advancement chairs manage everything. Counselors sign off merit badges for Scouts assigned to them. Parents see and plan for their own Scouts. Scouts 13 and older can sign in for themselves.',
  },
  birthMonth: {
    title: 'Why birth month and year?',
    body: 'Some rules depend on age, like finishing Eagle before 18. We store only the month and year, never the full birthday.',
  },
  counselor: {
    title: 'Merit badge counselor',
    body: 'An approved adult who teaches a merit badge and signs off the requirements. Counselors must have current Youth Protection training.',
    learnMore: 'https://www.scouting.org/skills/merit-badges/',
  },
  difficulty: {
    title: 'Difficulty and time',
    body: 'The squares show how hard a badge usually is, from 1 (easy) to 5 (hard). The time is a typical estimate. Some badges, like Personal Management, take months.',
  },
  scoutbookReport: {
    title: 'Scoutbook report',
    body: 'Scoutbook is the official place for advancement records. This list shows what to type in since you last did. Tick each Scout off once it is entered so you do not repeat work.',
    learnMore: 'https://www.scouting.org/scoutbook/',
  },
  troopAward: {
    title: 'Troop award',
    body: 'Your own award with your own requirements, such as a troop service badge. It works like a merit badge: Scouts earn it and leaders sign off.',
  },
  awardVersion: {
    title: 'Award versions',
    body: "When you change an award's requirements, you make a new version. Scouts already working on it stay on the old one until you move them. Nobody loses progress by surprise.",
  },
  mediaConsent: {
    title: 'Photo permission',
    body: 'Photos of a Scout go on the public website only if a parent said yes. A parent or leader can change this at any time. With no answer, we treat it as no.',
  },
  publishSite: {
    title: 'Publishing your website',
    body: 'Publishing makes your troop page visible to anyone with the address. Nothing goes live until you press Publish. You can unpublish whenever you like. Only titles, dates and places of public events are shown, plus the text you wrote.',
  },
  siteAddress: {
    title: 'Web address',
    body: 'The last part of your troop page link. Use short lowercase words, like troop-101. People can type it, so keep it simple.',
  },
  recruiting: {
    title: 'Join us requests',
    body: 'When a family fills in the Join us form on your website, it lands here. Reply to them, then invite them from the Roster.',
  },
  signInLink: {
    title: 'Email sign-in link',
    body: 'There is no password. We email you a link. Open it on this device and you are signed in. Check your spam folder if it does not arrive in a minute.',
  },
  gettingStarted: {
    title: 'Getting started',
    body: 'A short list of first steps for a new troop. Items tick off by themselves as you do them.',
  },
  attendanceLog: {
    title: 'What gets logged',
    body: 'Camping nights, hiking miles and service hours you enter for an event are added to each Scout who was present.',
  },
} satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP;

/** Scouting words used in the app, in plain language. */
export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: 'Advancement', meaning: 'A Scout moving up ranks and earning merit badges.' },
  { term: 'Blue card', meaning: HELP.blueCard.body },
  { term: 'Board of review', meaning: HELP.boardOfReview.body },
  { term: 'Counselor', meaning: HELP.counselor.body },
  { term: 'Eagle-required', meaning: HELP.eagleRequired.body },
  { term: 'Merit badge', meaning: 'A topic a Scout studies with a counselor, from chess to camping. Each has its own requirements.' },
  { term: 'Partials', meaning: HELP.partial.body },
  { term: 'Patrol', meaning: 'A small group of Scouts in a troop who camp and plan together.' },
  { term: 'Position of responsibility', meaning: HELP.positionOfResponsibility.body },
  { term: 'Rank', meaning: 'The steps of Scouts BSA: Scout, Tenderfoot, Second Class, First Class, Star, Life, Eagle.' },
  { term: 'Scoutbook', meaning: 'The official Scouting America site where advancement is recorded.' },
  { term: 'Scoutmaster conference', meaning: HELP.scoutmasterConference.body },
  { term: 'Sign-off', meaning: HELP.signOff.body },
  { term: 'YPT', meaning: HELP.ypt.body },
];

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
