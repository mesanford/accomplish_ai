/** The privacy policy's wording, kept apart from the page so it can be reviewed and edited in one place. */

export const PRIVACY_EFFECTIVE = 'October 15, 2026';
export const PRIVACY_OPERATOR = 'MM Sanford';
/** Where privacy questions and deletion requests go. */
export const PRIVACY_EMAIL: string | null = 'privacy@msanford.com';
/** COPPA's online notice must give the operator's postal address and phone number (16 CFR 312.4(d)(1)). */
export const PRIVACY_ADDRESS = '1107 Scotney Castle Court, Green Bay, WI 54313';
export const PRIVACY_PHONE: string | null = '920-530-8196';

export interface PolicySection {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    id: 'who',
    heading: 'Who we are',
    paragraphs: [
      `Forthright helps Scouts BSA troops plan and track advancement. It is run by ${PRIVACY_OPERATOR} ("we"). Forthright is not made by or affiliated with Scouting America.`,
      'This policy explains what Forthright collects, why, who can see it, and how to have it corrected or deleted.',
    ],
  },
  {
    id: 'collect',
    heading: 'What we collect',
    items: [
      'Adults who sign in: name, email address and the troop roles you hold (leader, parent, counselor). If you sign in with Google, we receive your name and email from Google. Leaders also give their Youth Protection training expiry date.',
      "Scouts: name, birth month and year (never the full date), current rank, the ranks, merit badges and requirements they've completed and when, who signed each one off, blue cards, photos of signed paper blue cards, advancement plans, event attendance and troop messages.",
      'Families who use a troop website\'s "Join us" form: the parent or guardian\'s name, email, optional phone number, the Scout\'s age or grade, and any note they add.',
      'Scouts 13 and older who sign in: their email address, and what they type, such as plan requests and messages.',
      'Merit badge counselors from outside the troop: the name and email address a leader enters.',
      'Troop websites: what leaders choose to publish, such as meeting details, events, contacts and photos.',
      'Usage counts: how many AI drafts each person makes per day, so we can keep a daily limit.',
    ],
    paragraphs: [
      'We do not use analytics or advertising tools, and we do not set tracking cookies. Your browser stores a few preferences on your device, such as whether you hid the Getting started list, and the sign-in session that keeps you signed in.',
      'Google, which hosts Forthright, processes your IP address and basic browser information to deliver pages, keep you signed in and protect the service.',
    ],
  },
  {
    id: 'use',
    heading: 'How we use it',
    items: [
      'To run Forthright for your troop: planning paths to rank, recording sign-offs, managing blue cards and counselors, events, messages and the troop website.',
      'To follow Youth Protection rules. Messages are only between people in the same troop, and every conversation that includes a Scout also includes an adult. Scouts can message adults but not other Scouts, and only an adult can start a conversation with several Scouts. An adult in a conversation with a Scout must have current Youth Protection training, except a parent talking with their own children. The Scout\'s parent, or a second trained adult if the parent is not on Forthright, is added automatically and can read every message.',
      'To build the report leaders use to enter advancement in Scoutbook. Leaders download it; we never send records to Scouting America ourselves.',
      'To send sign-in links by email.',
    ],
    paragraphs: ['We do not sell personal information, use it for advertising, or share it with anyone for their own marketing.'],
  },
  {
    id: 'see',
    heading: 'Who can see it',
    items: [
      'Everyone in a troop who has a login (leaders, parents, counselors and Scouts 13 and older) can see the troop roster (names and roles), events, who said they are coming and who attended, the list of merit badge counselors, and troop awards.',
      "Only leaders see every Scout's private details: birth month and year, rank dates, progress, sign-offs, blue cards, photos of paper blue cards and plans. Parents see these only for their own Scouts, Scouts 13 and older only for themselves, and counselors only for the merit badges assigned to them.",
      'Messages are seen only by the people in the conversation. "Join us" requests are seen only by that troop\'s leaders.',
      'These limits are enforced on our servers, not only in the app.',
      'We, the operator, can access stored data. We look at a troop\'s information only to run and secure Forthright, to answer a request from the troop or a family, to look into a safety concern, or when the law requires it.',
      'Anything a leader publishes on the troop website is public.',
    ],
  },
  {
    id: 'photos',
    heading: 'Troop websites and photos',
    items: [
      "A photo that shows a Scout, including the website's cover photo and logo, is published only if every Scout in it has a parent's or guardian's media consent, or the leader confirms that no Scout can be identified in it.",
      'If media consent is withdrawn, every photo on the website showing that Scout is taken down right away.',
      'Before a photo is published, Forthright removes hidden information stored in the file, such as the location where it was taken and camera details.',
      'Photos of signed paper blue cards are never published. Only leaders and the Scout\'s family can see them.',
    ],
  },
  {
    id: 'providers',
    heading: 'Companies that help us run Forthright',
    items: [
      'Google (Firebase and Google Cloud) hosts the app and stores its data in the United States, handles sign-in, stores photos and runs our server code.',
      'Anthropic provides Claude, the AI behind "Draft with AI" and the website About us helper. To draft a plan we send a Scout\'s birth month and year, current rank, rank dates, merit badges already earned and the words typed into the request box. We remove the names of people on your troop roster from what you type, but please don\'t include names, health, family or school details. For the About us helper we send the troop\'s name, unit number and council and the leader\'s notes, with roster names removed. Under Anthropic\'s commercial terms, data sent through its API is not used to train its models.',
    ],
    paragraphs: ['These companies process data only to provide their services to us.'],
  },
  {
    id: 'children',
    heading: "Children's privacy",
    paragraphs: [
      "Scouts under 13 cannot have their own Forthright login. Their information is entered by a troop leader or by their parent, and their parent reads troop messages for them. We collect only what advancement needs, which is why we ask for a birth month and year and never a full birth date.",
      'When a parent or guardian joins Forthright for their Scout, or adds their Scout, we show a notice of what we collect and how we use it, and we record that they agreed: who, which Scout, when, and which version of the notice. Media consent for website photos is a separate choice.',
      'When a troop leader adds a Scout who may be under 13, the leader confirms that the Scout\'s parent or guardian has given the troop permission to keep the Scout\'s advancement records in Forthright, and we record who confirmed and when.',
      "A parent or guardian can review their child's information in Forthright at any time, and can ask us to correct or delete it as described below. They can also withdraw consent from the Scout's page; that asks the troop to delete the Scout's information, and leaders are shown a notice to remove it.",
    ],
  },
  {
    id: 'choices',
    heading: 'Your choices',
    items: [
      'Correct most information yourself in the app, or ask a troop leader to.',
      "Withdraw a Scout's media consent at any time. Photos showing that Scout are taken off the troop website.",
      'Delete your own account at any time from the Account page. This removes your sign-in and your place in your troops. Your Scouts\' records stay with the troop, and sign-offs you made stay in the Scouts\' records.',
      "Have a Scout's information deleted. A troop leader can use Remove from troop on the Scout's page, which deletes their profile, advancement, blue cards and photos of paper blue cards, plan, attendance and website photos. Parents can ask a leader to do this. It cannot be undone.",
      'Ask for a copy of the information we hold about you or your child, or ask us to delete it by email instead. We respond within 30 days.',
    ],
  },
  {
    id: 'keep',
    heading: 'How long we keep it',
    paragraphs: [
      'We keep information only as long as we need it, and delete it automatically on this schedule:',
    ],
    items: [
      "A Scout's records (name, birth month and year, advancement, blue cards and photos of them, sign-offs, attendance, plans and consent records): deleted 12 months after a leader marks the Scout as having left the troop, or 12 months after the Scout turns 18, whichever comes first. Because we store only the birth month and year, we treat a Scout as 18 from the first day of the month after their 18th birthday month. A leader can also delete a Scout's records at any time.",
      'Troop messages: a conversation and all of its messages are deleted 24 months after its last message.',
      '"Join us" requests from a troop website: deleted 12 months after they were sent. Troop leaders can delete one sooner.',
      'Daily counts of AI drafts: deleted after 30 days. Forthright does not save the text of plan requests sent to Claude.',
      "Inactive troops: if no one in a troop has used Forthright for 18 months, the troop and everything in it are deleted, including its records, files, website and web address. People's sign-in accounts are not deleted; anyone can delete their own account from the Account page.",
      'Deleted information is removed from our database right away. Deleted files, such as photos, can be recovered by us for up to 7 days and are then gone for good. We do not keep separate backups of the database. Google keeps service logs, which hold technical details such as IP addresses and record ids but not Scouts\' records, for up to 30 days.',
    ],
  },
  {
    id: 'security',
    heading: 'Security',
    paragraphs: [
      'Data is encrypted in transit and at rest on Google Cloud. Access is limited by troop and role, and sign-off records cannot be edited after they are made. No system is perfectly secure; if a breach affects your information, we will tell you as the law requires.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes and contact',
    paragraphs: [
      'If we change this policy, we will post the new version here with a new date. For important changes we will also email troop leaders before they take effect.',
      'This policy is governed by the laws of the State of Wisconsin and applicable United States law.',
    ],
  },
];
