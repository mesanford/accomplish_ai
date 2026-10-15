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
  /** Shown before the list. */
  paragraphs?: string[];
  items?: string[];
  /** Shown after the list. */
  notes?: string[];
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
      'Adults who sign in: name, email address and the troop roles you hold (Scoutmaster, leader, advancement chair, committee, counselor, parent). If you sign in with Google, we receive your name and email from Google. Leaders also give their Youth Protection training expiry date.',
      "Scouts: name, birth month and year (never the full date), current rank, the ranks, merit badges and requirements they've completed and when, who signed each one off, blue cards, photos of signed paper blue cards, advancement plans, event attendance and troop messages.",
      'Families who use a troop website\'s "Join us" form: the parent or guardian\'s name, email, optional phone number, the Scout\'s age or grade, and any note they add.',
      'Scouts 13 and older who sign in: their email address, and what they type, such as plan requests and messages.',
      'Merit badge counselors from outside the troop: the name and email address a leader enters.',
      'Troop websites: what leaders choose to publish, such as meeting details, events, contacts and photos.',
      'Usage counts: how many AI drafts each person makes per day, so we can keep a daily limit.',
    ],
    notes: [
      'We do not use analytics or advertising tools, and we do not set tracking cookies. So that Forthright works with a weak signal, such as at camp, your browser saves a copy of the troop information you can see, including Scout records and messages, on your device. Signing out removes that copy. Your browser also saves your sign-in, the email address you used for a sign-in link until you finish signing in, and a few preferences, such as whether you hid the Getting started list. On a shared computer, sign out when you are done.',
      'Google, which hosts Forthright, processes your IP address and basic browser information to deliver pages, keep you signed in and protect the service. Pages also load fonts from Google Fonts, which receives your IP address.',
      'Because we do no tracking, we treat every visitor the same whether or not their browser sends a Do Not Track or Global Privacy Control signal.',
    ],
  },
  {
    id: 'use',
    heading: 'How we use it',
    items: [
      'To run Forthright for your troop: planning paths to rank, recording sign-offs, managing blue cards and counselors, events, messages and the troop website.',
      'To follow Youth Protection rules. Messages are only between people in the same troop, and every conversation that includes a Scout also includes an adult. Scouts can message adults but not other Scouts, and only an adult can start a conversation with several Scouts. An adult in a conversation with a Scout must have current Youth Protection training, except a parent talking with their own children. The Scout\'s parent, or a second trained adult if the parent is not on Forthright, is added automatically and can read every message.',
      'To build the report leaders use to enter advancement in Scoutbook. Leaders download it; we never send records to Scouting America ourselves.',
      'To send email: sign-in links; a copy of the notice a parent agreed to; and blue card updates (a new request to the Scoutmaster and advancement chair; approval, counselor and completion to the Scout\'s parents; an assignment to the counselor). Scouts are not emailed. Anyone can turn blue card emails off on the Account page; consent confirmations are always sent.',
    ],
    notes: ['We do not sell personal information, use it for advertising, or share it with anyone for their own marketing.'],
  },
  {
    id: 'see',
    heading: 'Who can see it',
    items: [
      'Everyone in a troop who has a login (leaders, parents, counselors and Scouts 13 and older) can see the troop roster: names, roles, which parents are linked to which Scouts, whether each Scout has photo consent for the website, whether a Scout has left the troop, and adults\' Youth Protection training expiry dates. They can also see events, who said they are coming and who attended, the list of merit badge counselors, and troop awards.',
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
      "A photo that shows a Scout, including the website's cover photo and logo, is published only if every Scout the leader tags in it has media consent, or the leader confirms that no Scout can be identified in it. Media consent is given by a parent or guardian in Forthright, or recorded by a leader from the family's signed media release form.",
      'If media consent is withdrawn, photos on the website where that Scout is tagged come down within minutes. We can\'t recall copies someone else already saved.',
      'Leaders write photo captions and website text. Please don\'t name Scouts in them.',
      'Before a photo is published, Forthright removes hidden information stored in the file, such as the location where it was taken and camera details.',
      'Photos of signed paper blue cards are never published. Only leaders and the Scout\'s family can see them.',
    ],
  },
  {
    id: 'providers',
    heading: 'Companies that help us run Forthright',
    items: [
      'Google (Firebase and Google Cloud) hosts the app and stores its data in the United States, handles sign-in, stores photos and runs our server code.',
      'Resend delivers our emails. It receives the recipient\'s email address and the email itself: a Scout\'s first name, the merit badge, the troop name and links back to Forthright. It never receives birth dates, messages, photos or last names.',
      'Anthropic provides Claude, the AI behind "Draft with AI" and the website About us helper. To draft a plan we send a Scout\'s birth month and year, current rank, rank dates, merit badges already earned, the goal rank and target date, and the words typed into the request box. For the About us helper we send the troop\'s name, unit number and council and the leader\'s notes. In both, we try to remove the names of people on your troop roster from what you type, but nicknames or misspellings may get through, so please don\'t include names, health, family or school details. Under Anthropic\'s commercial terms, this data is not used to train its models; Anthropic deletes it within 30 days unless it must keep it longer to enforce its usage policy or the law. AI drafts can be wrong: Forthright checks each plan against the advancement rules, and a person decides whether to use it.',
    ],
    notes: ['These companies process data for us under their contracts with us. They may keep limited data as their terms or the law require.'],
  },
  {
    id: 'children',
    heading: "Children's privacy",
    paragraphs: [
      "Scouts under 13 cannot have their own Forthright login. Their information is entered by a troop leader or by their parent, and their parent reads troop messages for them. We collect only what advancement needs, which is why we ask for a birth month and year and never a full birth date.",
      'When a parent or guardian joins Forthright for their Scout, adds their Scout, or is linked to their Scout by a troop leader, we show a notice of what we collect and how we use it, and we record that they agreed: who, which Scout, when, and which version of the notice. A parent a leader links sees nothing about that Scout until they agree, and declining removes the link. Media consent for website photos is a separate choice.',
      'When a troop leader adds a Scout who may be under 13, the leader confirms that the Scout\'s parent or guardian has given the troop permission to keep the Scout\'s advancement records in Forthright, and we record who confirmed and when.',
      "A parent or guardian can review their child's information in Forthright at any time, and can ask us to correct or delete it as described below. They can also withdraw consent from the Scout's page; that asks the troop to delete the Scout's information, and leaders are shown a notice to remove it.",
    ],
  },
  {
    id: 'choices',
    heading: 'Your choices',
    items: [
      "See your Scout's information in Forthright at any time. To correct a Scout's name, birth month and year, rank or advancement, ask a troop leader, or email us. You can edit your Scout's plan yourself.",
      "Withdraw a Scout's media consent at any time. Photos where that Scout is tagged come off the troop website.",
      "Delete your own account from the Account page. This removes your sign-in, your profile and your place in your troops. If you are a troop's only leader, invite another leader first. Your Scouts' records stay with the troop, sign-offs you made stay in the Scouts' records, and messages you sent stay in their conversations until those are deleted on the schedule below.",
      "Have a Scout's information deleted. A troop leader can use Remove from troop on the Scout's page. It deletes the Scout's profile, advancement, sign-offs, blue cards and photos of paper blue cards, plan, attendance, and website photos that show only them. Messages already sent stay in their conversations until those are deleted on the schedule below. It cannot be undone. Parents can ask a leader, or email us.",
      'Ask us for a copy of the information we hold about you or your child, or ask us to correct or delete it, by email. To protect your family, we first check that you are the person, or the parent, linked to that information in Forthright. We aim to respond within 45 days.',
    ],
  },
  {
    id: 'keep',
    heading: 'How long we keep it',
    paragraphs: [
      'We keep information only while the troop needs it to run Forthright, and delete it on this schedule. Deletion runs automatically each night. We keep a Scout\'s records while they are in the troop so leaders can track advancement toward Eagle, which ends at 18.',
    ],
    items: [
      "A Scout's records (name, birth month and year, advancement, blue cards and photos of them, sign-offs, attendance, plans and consent records): deleted 12 months after a leader marks the Scout as having left the troop, or 12 months after the Scout turns 18, whichever comes first. Because we store only the birth month and year, we treat a Scout as 18 from the first day of the month after their 18th birthday month. A leader can also delete a Scout's records at any time.",
      'Troop messages: a conversation and all of its messages are deleted 24 months after its last message.',
      '"Join us" requests from a troop website: deleted 12 months after they were sent. Troop leaders can delete one sooner.',
      'Daily counts of AI drafts: deleted after 30 days. Forthright does not save the text of plan requests sent to Claude.',
      "Inactive troops: if no one in a troop has used Forthright for 18 months, we plan to delete the troop and everything in it, including its records, files, website and web address. Until that is switched on, we review inactive troops and delete them on request; email us to have a troop deleted sooner. People's sign-in accounts are not deleted this way; anyone can delete their own account from the Account page.",
      'When something is deleted it is removed from our database right away. Deleted files, such as photos, can be recovered by us for up to 7 days and are then gone for good. We do not keep separate backups of the database. Google keeps service logs with technical details such as IP addresses and record ids (not names or Scouts\' records) for up to 30 days. Copies people made themselves, such as a downloaded Scoutbook report or a saved photo, are not deleted by us.',
    ],
  },
  {
    id: 'security',
    heading: 'Security',
    paragraphs: [
      'Data is encrypted in transit and at rest on Google Cloud. Access is limited by troop and role, and sign-off records cannot be edited after they are made. No system is perfectly secure. If we learn that someone got into information in Forthright without permission, we will tell the affected troop leaders and families by email or in the app as soon as we reasonably can, and say what happened and what we are doing about it.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes and contact',
    paragraphs: [
      'If we change this policy, we will post the new version here with a new date. We will not start using Scouts\' information in a new way without first asking their parents to agree.',
      'This policy is governed by the laws of the State of Wisconsin and applicable United States law.',
    ],
  },
];
