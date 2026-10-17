import type { RoleGuide } from './types';

/** The quartermaster keeps the troop's gear and library. A Scout 13 or older can hold this role. */
export const QUARTERMASTER_GUIDE: RoleGuide = {
  id: 'quartermaster',
  title: "I'm the quartermaster",
  sees: [
    'The Equipment page: the whole catalog, what is checked out, who has it and what is overdue.',
    'Every request for gear, and the repair log for each item.',
    'The things every troop member sees: Home, Events, Badges, Announcements sent to you, and Documents shared with members.',
  ],
  cannot: [
    'See the Roster, blue cards, Scout accounts, event sign-ups or health notes.',
    'Change advancement records. The quartermaster role grants nothing outside Equipment.',
    'Delete an item that is checked out, or lower its quantity below what is out.',
    'Check out a retired item.',
  ],
  tasks: [
    {
      task: 'Add gear to the list',
      steps: [
        'Open Equipment and press "Add an item".',
        'Enter a name, category, quantity and condition. A tag, location, purchase date, cost and notes are optional.',
        'Add a photo of the gear if you like. Photos of gear only, never of people.',
        'Press "Add item".',
      ],
    },
    {
      task: 'Check an item out and back in',
      steps: [
        'Open the item and press "Check out".',
        'Choose a person or an event, how many, and a due date. Add a note if you want.',
        'When it comes back, open Equipment, go to the Checked out tab and press "Check in".',
        'Overdue items show a warning on the Equipment page.',
      ],
    },
    {
      task: 'Answer a request',
      steps: [
        'Any member can ask for an item for an event. The Requests tab shows a number when some are waiting.',
        'Open the Requests tab and press Approve or Decline.',
        'Nothing goes out until you approve. A due date is set to the day after the event unless you choose another.',
      ],
    },
    {
      task: 'Keep a repair log',
      steps: [
        'Open the item and find "Repair log".',
        'Write what was done or what is wrong. Add the cost in dollars if you know it.',
        'Notes can be added and removed, but not rewritten.',
        'Change the condition to "Needs repair" or "Retired" on the item when that is true.',
      ],
    },
    {
      task: 'Print or export the list',
      steps: ['Open Equipment.', 'Press "Print list" for a paper copy.', 'Press "Download inventory" or "Download check-outs" for a spreadsheet.'],
    },
  ],
};
