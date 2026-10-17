import type { RoleGuide } from './types';

/** Things that work the same for every role: sign-ups, the calendar, announcements, phones and several roles. */
export const EVERYONE_GUIDE: RoleGuide = {
  id: 'everyone',
  title: 'For everyone: events, announcements and your phone',
  sees: [
    'Your own events, announcements sent to you, Documents shared with members and the Equipment list.',
    'Your own sign-ups. A parent also sees their Scouts\'.',
  ],
  cannot: [
    "See other people's sign-ups, health notes or accounts.",
    'Read a conversation you are not in.',
  ],
  tasks: [
    {
      task: 'Sign up for an event',
      steps: [
        'Open Events and click the event. If sign-ups are on, you see a Sign up section.',
        'Each event shows its spots, deadline, any fee and whether permission is needed.',
        'When it is full, you go on a waitlist. The first person waiting moves up when someone cancels, and gets an email.',
        'A parent gives permission for a Scout when the event asks for it. A leader can record a signed paper slip instead. A health note is read only by troop leaders.',
        'If there is a fee, the treasurer charges it to the Scout\'s account.',
      ],
    },
    {
      task: 'Add the troop calendar to your phone',
      steps: [
        'Open Events and press "Add to your calendar".',
        'Press "Open in calendar app", or copy the link and add it to Google, Apple or Outlook as a subscription.',
        'New events show up on their own. The calendar has no names of Scouts.',
        'Keep the link private. If it gets out, press "Make a new link". The old one stops working.',
      ],
    },
    {
      task: 'Read announcements and newsletters',
      steps: [
        'Open Announcements. Pinned posts are at the top.',
        'Posts are one-way. To reply, send a message from the Messages page.',
        'Choose in Account whether to get announcements by email. Scouts are never emailed.',
      ],
    },
    {
      task: 'Find documents and the troop website',
      steps: [
        'Open Documents for forms, lists and handbooks the troop shared with you.',
        'If your troop has published a website, anyone can see its pages about the troop, a calendar of public events, public documents and a Join us form. Ask a leader for the address.',
      ],
    },
    {
      task: 'Install Forthright on your phone',
      steps: [
        'On an iPhone or iPad, open Forthright in Safari, tap the Share button, then choose Add to Home Screen.',
        'On Android or a computer, open Account and press "Install Forthright" when it appears.',
        'It then opens like an app and keeps working when the signal is poor.',
        'In Account you can also turn on "Notify me on this device". On an iPhone, install first and open it from your home screen.',
      ],
    },
    {
      task: 'Hold more than one role',
      steps: [
        'One person can be a leader and a parent, or a parent and the treasurer, and so on.',
        'You get everything each of your roles allows. A role never takes away what another gives.',
        'A leader changes your roles on the Roster. A parent role needs you to agree to the parent notice.',
        'The Help page opens the guides for all of your roles.',
      ],
    },
  ],
};
