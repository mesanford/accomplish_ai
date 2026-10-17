import type { RoleGuide } from './types';

/** The treasurer keeps Scout accounts. Only the treasurer changes them. */
export const TREASURER_GUIDE: RoleGuide = {
  id: 'treasurer',
  title: "I'm the treasurer",
  sees: [
    'The Accounts page: every Scout\'s balance and open charges, the troop\'s general fund, and fundraisers.',
    "Each Scout's account statement, with every entry.",
    'Card payments, if your troop has them (see the last task).',
    "The fee on each event, with buttons to charge it to Scout accounts.",
    'The things every troop member sees: Home, Events, Badges, Announcements sent to you, Documents shared with members, and the Equipment list.',
  ],
  cannot: [
    'See the Roster, blue cards, Scoutbook, patrols, the activity report or the troop website draft. Those are for leaders.',
    'Read event sign-ups, answers or health notes.',
    'Change advancement records, post announcements, or change the Equipment list.',
    'Pay out account credit as cash. Forthright only keeps the record. It does not hold money.',
  ],
  tasks: [
    {
      task: 'Check the account settings first',
      steps: [
        'Open Accounts, then "Account settings".',
        'Set the default credit rule for new fundraisers.',
        'Choose whether a charge may take a balance below zero.',
        'Write what account credit can pay for. Families see this.',
        'Choose where a leaving Scout\'s balance goes by default: the general fund or a sibling. Press "Save settings".',
      ],
    },
    {
      task: 'Run a fundraiser',
      steps: [
        'Open Accounts and press "New fundraiser" under Fundraisers.',
        'Name it and check the credit rule.',
        "Enter each Scout's sales. Totals show what the Scouts and the troop get.",
        'Press "Post credits to accounts". Or press "Save for later" and nothing is credited yet.',
        "To fix a wrong credit after posting, reverse it on the Scout's account.",
      ],
    },
    {
      task: 'Post a charge',
      steps: [
        'Open Accounts and press "Post a charge".',
        'Enter the amount for each Scout and a description. Families see the description.',
        'Choose who it applies to: Scouts marked present at an event, Scouts you choose, or every Scout.',
        'Choose to pay from account credit where there is enough, or leave it open for the family to pay. Press "Post charge".',
      ],
    },
    {
      task: 'Charge an event fee',
      steps: [
        'A leader sets the fee per Scout in the event settings.',
        'Open the event and find the Fee section.',
        'Press "Charge going Scouts" or "Charge attendees".',
        'Each Scout is charged once, even if you press a button again.',
      ],
    },
    {
      task: 'Record a payment',
      steps: [
        'Open Accounts and press "Record a payment".',
        'Choose the Scout, how the family paid (cash, check, other or account credit) and the date.',
        'Tick the open charges it pays. Anything more becomes account credit.',
        'Deposit the money in the troop bank account as usual. Forthright only keeps the record.',
      ],
    },
    {
      task: 'Correct a mistake',
      steps: [
        "Open the Scout's account from the Accounts list.",
        'Find the entry and press Reverse. Give a reason.',
        'Nothing is edited or deleted. A correcting entry is added, so the history stays honest.',
      ],
    },
    {
      task: 'Give a family a statement, or export the books',
      steps: [
        "Families see their own Scout's balance, open charges and entries on the Scout's page.",
        'For the whole troop, open Accounts and press "Download balances" or "Download every entry". These open in a spreadsheet.',
      ],
    },
    {
      task: 'Settle a Scout who leaves',
      steps: [
        "A leader first presses \"Mark (name) as left the troop\" on the Scout's page.",
        "Open Accounts and click the Scout's name.",
        'Under "Settle the balance", choose the general fund or a sibling in the troop, then press "Move the balance".',
        'Credit stays with the troop. It is never paid out as cash. Open charges stay until a family pays or you reverse them.',
      ],
    },
    {
      task: 'Card payments',
      steps: [
        'Card payments may not be available yet. If you do not see "Card payments" in Account settings or "Pay online" on a Scout\'s account, they are not turned on for Forthright.',
        'When they are on, press "Connect Stripe" in Account settings and finish the steps on Stripe. The money goes to the troop\'s own Stripe account. Forthright never holds it.',
        'Paid card payments post to the Scout\'s account on their own. The Card payments page lists them, with a download for reconciling.',
      ],
    },
  ],
};
