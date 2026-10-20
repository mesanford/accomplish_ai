/** The features page's words, second half: money, equipment, the troop website, people and roles, and safety. */
import type { FeatureCategory } from './featuresAdvancement';

export const TROOP_CATEGORIES: FeatureCategory[] = [
  {
    id: 'money',
    name: 'Scout accounts and fundraising',
    summary: "Every Scout's credit and charges, kept to the cent, with a treasurer in charge.",
    features: [
      {
        title: 'Scout accounts',
        text: 'Each Scout has an account of fundraiser credit, charges and payments. Entries are never edited; a mistake is reversed with a reason, so the books always balance.',
      },
      {
        title: 'Fundraisers',
        text: "Paste in each Scout's popcorn or wreath sales, choose how much goes to the Scout's account, and post credits for everyone at once.",
      },
      {
        title: 'Charges and payments',
        text: 'Charge dues or a campout to a group of Scouts, record cash and check payments, and pay open charges from credit.',
      },
      {
        title: 'Statements for families',
        text: "Parents see their own Scout's account and what is owed. Scouts 13 and older see their own. Counselors and other leaders see none of it.",
      },
      {
        title: 'Troop summary',
        text: 'The treasurer, Scoutmaster and advancement chair see every account, with a spreadsheet export for the troop committee.',
      },
      {
        title: 'Pay online',
        text: "Families pay open charges by card into the troop's own Stripe account, and the payment posts to the Scout's account by itself. Forthright never holds the money.",
        soon: true,
      },
    ],
  },
  {
    id: 'equipment',
    name: 'Equipment and library',
    summary: 'Know where every tent, stove and merit badge pamphlet is.',
    features: [
      {
        title: 'Inventory',
        text: 'Track gear and library books with quantities, tags, locations, condition and photos. Search and filter by category.',
      },
      {
        title: 'Check out and check in',
        text: 'Check items out to a Scout, an adult or an event with a due date, and note the condition when they come back. Overdue items stand out.',
      },
      {
        title: 'Requests',
        text: 'Members ask for gear for an event, and the quartermaster approves. A Scout 13 or older can be the quartermaster.',
      },
      {
        title: 'Repair log and exports',
        text: 'Keep repair notes for each item, download the inventory as a spreadsheet, or print a list for the trailer.',
      },
    ],
  },
  {
    id: 'website',
    name: 'Troop website',
    summary: 'A public site that helps new families find you, without the web work.',
    features: [
      {
        title: 'A site in minutes',
        text: "Cover photo, about, meeting details, upcoming events, gallery, questions and leader contacts, in your troop's colors.",
      },
      {
        title: 'Your own pages',
        text: 'Add up to 10 pages, such as "New families" or "High adventure", with headings, lists, links and images.',
      },
      {
        title: 'Documents',
        text: 'Share permission slips, gear lists and the troop handbook with the public, with members only, or with leaders only. Medical forms are never public.',
      },
      {
        title: 'Calendar and "Join us"',
        text: 'A public calendar page that visitors can subscribe to, and a "Join us" form that sends new families\' questions to your leaders.',
      },
      {
        title: 'Photos with consent',
        text: 'A photo that shows a Scout appears only with media consent, and location data is removed from every image.',
      },
      {
        title: 'Your own web address',
        text: "Put your troop's site on your own domain. Forthright shows the records to add and sets up the secure certificate.",
      },
    ],
  },
  {
    id: 'people',
    name: 'People and roles',
    summary: 'Everyone sees what their job needs, and nothing more.',
    features: [
      {
        title: 'Roles that fit a troop',
        text: 'Scoutmaster, leader, advancement chair, committee member, treasurer, quartermaster, counselor and parent. One person can hold several, such as a leader who is also a parent.',
      },
      {
        title: 'Families linked to Scouts',
        text: 'Parents are linked to their own Scouts and act for those under 13. A parent agrees to a plain notice before seeing anything, and their consent is recorded.',
      },
      {
        title: 'Troop settings',
        text: "Your troop's details, meeting place, time zone and leadership in one place, including the committee chair and chartered organization representative.",
      },
      {
        title: 'Simple invitations',
        text: 'Invite adults with a link. People sign in with Google or a link sent by email, so there are no passwords to remember.',
      },
    ],
  },
  {
    id: 'safety',
    name: 'Safety, privacy and access',
    summary: 'Built for families, and usable at camp.',
    features: [
      {
        title: 'No logins for Scouts under 13',
        text: 'A parent acts for a younger Scout. Scouts 13 and older can have their own login.',
      },
      {
        title: 'No ads, no selling, nothing tracked in the app',
        text: 'Forthright shows no ads and never sells data. Nothing you do after signing in is tracked, and data is deleted on a published schedule.',
      },
      {
        title: 'Works with a weak signal',
        text: 'Troop information you have opened stays readable at camp, even when the signal drops.',
      },
      {
        title: 'Install it like an app',
        text: "Add Forthright to your phone's home screen for a full-screen app that opens fast.",
      },
    ],
  },
];
