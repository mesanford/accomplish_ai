/** The features page's words, first half: advancement, merit badges, events, activity logs and communication.
 * Kept apart from the components so they can be reviewed in one place. Only describe what is live; mark anything
 * built but not yet switched on with `soon`. */

export interface Feature {
  title: string;
  text: string;
  soon?: boolean;
}

export interface FeatureCategory {
  id: string;
  name: string;
  summary: string;
  features: Feature[];
}

export const ADVANCEMENT_CATEGORIES: FeatureCategory[] = [
  {
    id: 'advancement',
    name: 'Advancement planning',
    summary: 'A clear path from Scout rank to Eagle, checked against the advancement rules.',
    features: [
      {
        title: 'Paths to the next rank',
        text: 'Scouts and parents plan the requirements for each rank, with target dates. Every plan is checked against the rules, such as time in rank and Eagle-required badges, before anyone relies on it.',
      },
      {
        title: 'Draft a plan with AI',
        text: 'Describe a goal, such as "First Class by summer camp", and Claude drafts a plan. Names are removed before anything is sent, and a person decides whether to use it.',
      },
      {
        title: 'Requirement sign-offs',
        text: 'Leaders sign off each requirement as it is done. Sign-offs are permanent records that show who signed and when.',
      },
      {
        title: 'Troop awards and earlier advancement',
        text: "Create your troop's own awards with their own requirements, and record ranks and badges a Scout earned before joining.",
      },
      {
        title: 'Ready for Scoutbook',
        text: 'When advancement is ready, Forthright builds a report your advancement chair uses to enter it in Scoutbook, and tracks what has been entered.',
      },
    ],
  },
  {
    id: 'merit-badges',
    name: 'Merit badges and blue cards',
    summary: 'Blue cards and counselors in one place, with the right people in charge.',
    features: [
      {
        title: 'Blue card requests',
        text: 'A Scout or parent asks to start a merit badge. The Scoutmaster and advancement chair are told, approve it and assign a counselor.',
      },
      {
        title: 'Only the right people change badges',
        text: 'Merit badge records can be changed only by the Scoutmaster, the advancement chair and the counselor assigned to that Scout and badge.',
      },
      {
        title: 'Counselors see only their Scouts',
        text: 'A counselor, even one from outside the troop, sees only the Scouts and badges assigned to them, and signs off requirements as they are done.',
      },
      {
        title: 'Paper blue cards too',
        text: "Photograph a signed paper blue card to keep it with the Scout's record. Only leaders and the Scout's family can see it.",
      },
      {
        title: 'Email updates',
        text: 'Families hear when a blue card is approved, a counselor is assigned and the badge is complete. Anyone can turn these emails off.',
      },
    ],
  },
  {
    id: 'events',
    name: 'Events and outings',
    summary: 'Sign-ups, permission slips and attendance, without the spreadsheet.',
    features: [
      {
        title: 'Sign-ups with limits',
        text: 'Set the number of spots, a deadline and questions such as dietary needs. When someone cancels, the next person on the waitlist moves up and their family is told.',
      },
      {
        title: 'Parent permission',
        text: 'For campouts that need it, a Scout is not counted as going until a parent gives permission in the app. Leaders see who still needs it.',
      },
      {
        title: 'Health and emergency notes',
        text: "A parent can add a note when signing up. Only leaders can read it, and it is deleted with the Scout's records.",
      },
      {
        title: 'Attendance that counts',
        text: 'Mark who came, and attendance credits the requirements the event covers, plus camping nights, service hours and hiking miles.',
      },
      {
        title: 'Reminders and calendar feeds',
        text: 'Families get a reminder two days before an event. Each member can add the troop calendar to Google, Apple or Outlook with a private link.',
      },
      {
        title: 'Event fees',
        text: 'Set a fee, and the treasurer charges it to the Scouts who went, straight into their Scout accounts. Each Scout is charged once.',
      },
    ],
  },
  {
    id: 'activity',
    name: 'Patrols and activity logs',
    summary: 'Camping nights, service hours and hiking miles add up on their own.',
    features: [
      {
        title: 'Patrols',
        text: "Organize Scouts into patrols with a patrol leader and assistant. Filter the roster by patrol and send announcements to a patrol's parents.",
      },
      {
        title: 'Automatic logs',
        text: 'Nights camped, service hours and miles hiked are credited from event attendance and stay correct if an event changes.',
      },
      {
        title: 'Entries from families',
        text: "A parent, or a Scout 13 or older, can add something the troop didn't schedule, such as a week at camp, for a leader to approve.",
      },
      {
        title: 'Progress that matters',
        text: "Each Scout's page shows progress toward the Camping merit badge's 20 nights and toward the service hours each rank requires.",
      },
      {
        title: 'Troop reports',
        text: "Totals by Scout and by patrol for any dates, a spreadsheet export, and the troop's yearly service hours for your council.",
      },
    ],
  },
  {
    id: 'communication',
    name: 'Communication',
    summary: 'Reach the right families, within Youth Protection rules.',
    features: [
      {
        title: 'Announcements',
        text: "Post to the whole troop, all parents, adults, leaders, one patrol, the parents of chosen Scouts, or everyone signed up for an event. People who join later see the past year's posts for their group.",
      },
      {
        title: 'Newsletters',
        text: 'Write a newsletter with sections and links to upcoming events, and email it to parents and adults. Scouts are never emailed.',
      },
      {
        title: 'Messages with Youth Protection built in',
        text: 'Every conversation with a Scout includes an adult with current Youth Protection training and a parent or second adult. Scouts cannot message each other.',
      },
      {
        title: 'Phone notifications',
        text: 'Opt-in notifications on your phone for announcements, blue cards, waitlists, permission requests and event reminders.',
      },
    ],
  },
];
