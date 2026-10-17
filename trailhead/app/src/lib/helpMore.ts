/**
 * More guidance copy: Scout accounts, gear, event sign-ups, announcements and installing the app.
 * Same rules as help.ts: short sentences, say what happens and why it matters.
 */
export interface HelpMoreEntry {
  title: string;
  body: string;
  learnMore?: string;
}

export const HELP_MORE = {
  scoutAccounts: {
    title: 'Scout accounts',
    body: 'A record of money for each Scout: fundraiser credit, charges and payments. Forthright only keeps the record. It does not take or hold money. The treasurer changes accounts. The Scoutmaster and advancement chair can look. A family sees only its own Scout.',
  },
  accountCredit: {
    title: 'Account credit',
    body: 'Money a Scout has earned or paid ahead, kept by the troop for Scouting costs. It is never paid out as cash. If a Scout leaves, the treasurer moves it to the general fund or a sibling.',
  },
  cardPayments: {
    title: 'Card payments',
    body: 'Families can pay open charges by card on Stripe. The money goes to the troop\'s own Stripe account. This may not be available yet. If you do not see "Pay online", pay the treasurer as usual.',
  },
  eventSignups: {
    title: 'Event sign-ups',
    body: 'Families sign up on the event page. You choose the number of spots, a deadline and who can sign up. When spots run out, the next people go on a waitlist and move up when someone cancels. A parent can be asked to give permission for each Scout.',
  },
  healthNote: {
    title: 'Health or emergency note',
    body: 'Anything a leader should know, such as an allergy or a medicine. Only troop leaders can read it. It is not shown back to the family.',
  },
  eventFee: {
    title: 'Event fee',
    body: 'A leader sets a fee per Scout on the event. The treasurer charges it to Scout accounts, once for each Scout.',
  },
  calendarFeed: {
    title: 'Calendar link',
    body: 'A private web address that adds the troop events to your phone calendar. It has event names, dates and places, and no names of Scouts. Anyone with the link can see the troop events, so keep it private. "Make a new link" stops the old one working.',
  },
  equipment: {
    title: 'Equipment',
    body: 'The troop\'s tents, cooking gear, tools and library books. Everyone can see the list and ask for an item for an event. The quartermaster and leaders check items out and in, and keep the repair log.',
  },
  announcements: {
    title: 'Announcements and newsletters',
    body: 'One-way posts to the people you choose. They are not conversations, so replies go through Messages. Scouts are never emailed. To post to an audience that includes Scouts, you need current Youth Protection training.',
  },
  patrols: {
    title: 'Patrols',
    body: 'Each Scout is in one patrol. Name a patrol leader and an assistant from its Scouts. You can send an announcement to the parents of one patrol.',
  },
  installApp: {
    title: 'Install on your phone',
    body: 'On an iPhone, tap the Share button, then Add to Home Screen. On Android, use "Install Forthright" on the Account page. It opens like an app and keeps working when the signal is poor.',
  },
  sitePages: {
    title: 'Website pages',
    body: 'Each extra page gets its own address and a place in the site menu. Use headings, text, bullet lists, links and images. Nothing shows until you press Publish.',
  },
  siteDocuments: {
    title: 'Documents on the website',
    body: 'A document set to public is listed on your site after you publish. Set it to members or leaders only and it comes off the site right away. Medical forms are never public.',
  },
} satisfies Record<string, HelpMoreEntry>;

/** More Scouting and Forthright words, in plain language. */
export const MORE_GLOSSARY: { term: string; meaning: string }[] = [
  { term: 'Account credit', meaning: HELP_MORE.accountCredit.body },
  { term: 'Newsletter', meaning: 'An announcement with up to six sections and links to events.' },
  { term: 'Quartermaster', meaning: 'The person who keeps the troop gear. A Scout 13 or older can do this job.' },
  { term: 'Scout account', meaning: HELP_MORE.scoutAccounts.body },
  { term: 'Treasurer', meaning: 'The adult who keeps Scout accounts: fundraiser credit, charges and payments.' },
  { term: 'Waitlist', meaning: 'The list of people who signed up after an event filled. The first one moves up when someone cancels.' },
];
