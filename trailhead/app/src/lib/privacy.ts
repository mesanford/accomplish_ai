/** The privacy policy's wording, kept apart from the page so it can be reviewed and edited in one place. */

export const PRIVACY_EFFECTIVE = 'October 14, 2026';
export const PRIVACY_OPERATOR = 'MM Sanford';
/** Where privacy questions and deletion requests go. */
export const PRIVACY_EMAIL: string | null = 'privacy@msanford.com';

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
      `Trailhead helps Scouts BSA troops plan and track advancement. It is run by ${PRIVACY_OPERATOR} ("we"). Trailhead is not made by or affiliated with Scouting America.`,
      'This policy explains what Trailhead collects, why, who can see it, and how to have it corrected or deleted.',
    ],
  },
  {
    id: 'collect',
    heading: 'What we collect',
    items: [
      'Adults who sign in: name, email address and the troop roles you hold (leader, parent, counselor). If you sign in with Google, we receive your name and email from Google. Leaders also give their Youth Protection training expiry date.',
      "Scouts: name, birth month and year (never the full date), current rank, the ranks, merit badges and requirements they've completed and when, who signed each one off, blue cards, photos of signed paper blue cards, advancement plans, event attendance and troop messages.",
      'Families who use a troop website\'s "Join us" form: the parent or guardian\'s name, email, optional phone number, the Scout\'s name and age or grade, and any note they add.',
      'Troop websites: what leaders choose to publish, such as meeting details, events, contacts and photos.',
      'Usage counts: how many AI drafts each person makes per day, so we can keep a daily limit.',
    ],
    paragraphs: [
      'We do not use analytics or advertising tools, and we do not set tracking cookies. Your browser stores a few preferences on your device, such as whether you hid the Getting started list, and the sign-in session that keeps you signed in.',
    ],
  },
  {
    id: 'use',
    heading: 'How we use it',
    items: [
      'To run Trailhead for your troop: planning paths to rank, recording sign-offs, managing blue cards and counselors, events, messages and the troop website.',
      'To follow Youth Protection rules. Messages between an adult and a Scout always include a parent or a second trained adult.',
      'To build the report leaders use to enter advancement in Scoutbook. Leaders download it; we never send records to Scouting America ourselves.',
      'To send sign-in links by email.',
    ],
    paragraphs: ['We do not sell personal information, use it for advertising, or share it with anyone for their own marketing.'],
  },
  {
    id: 'see',
    heading: 'Who can see it',
    items: [
      'Leaders see their own troop. Parents see their own Scouts. Counselors see only the merit badges they are assigned. Scouts 13 and older see their own records.',
      'These limits are enforced on our servers, not only in the app.',
      'Anything a leader publishes on the troop website is public. Photos that show a Scout appear there only if the Scout\'s family gave media consent, and they come down if consent is withdrawn.',
    ],
  },
  {
    id: 'providers',
    heading: 'Companies that help us run Trailhead',
    items: [
      'Google (Firebase and Google Cloud) hosts the app and stores its data in the United States, handles sign-in, stores photos and runs our server code.',
      'Anthropic provides Claude, the AI behind "Draft with AI". To draft a plan we send a Scout\'s birth month and year, current rank, rank dates, merit badges already earned and the request typed into the box. We do not send names. For the troop website\'s About us helper, we send the leader\'s notes with Scout names removed. Under Anthropic\'s commercial terms, data sent through its API is not used to train its models.',
    ],
    paragraphs: ['These companies process data only to provide their services to us.'],
  },
  {
    id: 'children',
    heading: "Children's privacy",
    paragraphs: [
      "Scouts under 13 cannot have their own Trailhead login. Their information is entered by a troop leader or by their parent, and their parent reads troop messages for them. We collect only what advancement needs, which is why we ask for a birth month and year and never a full birth date.",
      "A parent or guardian can review their child's information in Trailhead at any time, and can ask us to correct or delete it as described below.",
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
      "We keep a troop's information while the troop uses Trailhead. When a troop stops using Trailhead, or after a verified deletion request, we delete the information from our systems within 30 days.",
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
