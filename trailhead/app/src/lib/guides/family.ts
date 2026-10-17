import type { RoleGuide } from './types';

export const PARENT_GUIDE: RoleGuide = {
  id: 'parent',
  title: "I'm a parent",
  sees: [
    "Your own Scouts' pages: rank, plan, merit badges, blue cards, camping, service and hiking, and account.",
    "Your Scout's account: the balance, open charges and every entry. You can pay open charges by card where the troop has turned that on.",
    "Your Scouts' event sign-ups, and the troop's events, announcements sent to you and documents shared with members.",
    'The Equipment list, and anything borrowed by your Scout.',
  ],
  cannot: [
    "See another family's Scout, account, sign-ups or health notes.",
    'See a Scout a leader linked you to until you agree to the parent notice.',
    'Read back a health note after you save it. Only troop leaders can read it.',
    "Approve your Scout's blue card or sign off requirements. Leaders and counselors do that.",
    'Make a camping, service or hiking entry count on your own. A leader checks it first.',
    'Post announcements, unless you also hold a leader or committee role.',
  ],
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
      steps: ['Open Badges and search for the badge.', 'Press "Start a blue card".', 'The Scoutmaster or advancement chair approves it and assigns a counselor.'],
    },
    {
      task: 'Sign your Scout up for an event',
      steps: [
        'Open Events and click the event.',
        'Under Sign up, answer any questions. Add a health or emergency note if a leader should know something.',
        'If the event asks for permission, tick the box to give it.',
        'If the event is full, your Scout goes on a waitlist. You get an email if a spot opens up.',
        'To cancel, press "Cancel sign-up" on the same page.',
      ],
    },
    {
      task: 'Give permission when a Scout signs up for themselves',
      steps: [
        'A Scout 13 or older can sign up on their own. If the event needs permission, they wait with their spot held.',
        'Open the event. Under Sign up, give permission for your Scout. You can add a health note at the same time.',
        'Only a parent of the Scout can give permission. A leader cannot do it for you.',
      ],
    },
    {
      task: "See and pay your Scout's account",
      steps: [
        "Open your Scout's page and find the account section.",
        'It shows the balance, open charges and each entry. Forthright keeps this record. It does not take or hold money.',
        'If you see "Pay online", choose the charges and press Pay. You pay on Stripe\'s page, and the money goes to the troop. If you do not see it, card payments are not available yet. Pay the treasurer as usual.',
      ],
    },
    {
      task: 'Add a camping, service or hiking entry',
      steps: [
        "Open your Scout's page and find Camping, service and hiking.",
        'Fill in "Add an entry" and send it.',
        'It shows as waiting for a leader and does not count until a leader approves it.',
      ],
    },
    {
      task: 'Choose photo permission',
      steps: [
        "Open your Scout's page and find \"Photos on the troop website\".",
        'Press "Allow photos" or "Don\'t allow photos". You can change it at any time.',
        'With no answer, photos of your Scout are not used.',
      ],
    },
  ],
};

export const SCOUT_GUIDE: RoleGuide = {
  id: 'scout',
  title: "I'm a Scout",
  sees: [
    'Your own page: rank, plan, merit badges, blue cards, camping, service and hiking, and account.',
    'The troop events, announcements sent to you, Documents shared with members and the Equipment list.',
    'Your own event sign-ups and anything you have borrowed.',
  ],
  cannot: [
    "See other Scouts' pages or accounts.",
    'Read health notes or the leader pages.',
    'Sign up for an event on your own if you are under 13. A parent does that.',
    'Approve your own blue card or sign off your own requirements.',
    'Make a camping, service or hiking entry count until a leader checks it.',
  ],
  tasks: [
    {
      task: 'See my progress',
      steps: ['Open Home and tap your name.', 'You will see your rank, plan and badges.'],
    },
    {
      task: 'Start a merit badge',
      steps: ['Open Badges and find one you like.', 'Press "Start a blue card".', 'Ask your Scoutmaster to approve it.', 'Then call your counselor to set up a first meeting.'],
    },
    {
      task: 'Sign up for an event',
      steps: [
        'Open Events and tap the event.',
        'Answer the questions and press the sign-up button.',
        'If the event needs permission, a parent has to give it before you are marked going.',
        'If it is full, you go on the waitlist and get an email if a spot opens up.',
      ],
    },
    {
      task: 'Borrow troop gear',
      steps: [
        'Open Equipment and open an item.',
        'Press "Request this item", choose the event and how many.',
        'The quartermaster answers. Nothing goes out until they approve.',
      ],
    },
  ],
};
