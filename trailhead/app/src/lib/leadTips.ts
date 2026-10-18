import type { LeadStatus } from './types';

/**
 * What each stage of a family's request means, for the pill on a Recruiting card. Verified against the code: the
 * submit_interest function starts every request as new; making a join link (create_invite with a leadId) sets it to
 * invited; the family using that link (accept_invite) sets it to joined. Leaders can set any stage by hand
 * (firestore.rules allows status and notes). The tips never repeat a label or any button on the card.
 */
export const LEAD_TIP: Record<LeadStatus, string> = {
  new: 'This family asked about the troop on your public web page. A leader has not marked a reply yet.',
  contacted: 'A leader has been in touch with this family. A leader sets this by hand.',
  invited:
    'A join link was made for this family. This is set for you when you make the link, or you can set it by hand.',
  joined:
    'The family used their link and is now in the troop. This is set for you when they join, or you can set it by hand.',
  not_interested: 'The family said no for now. A leader sets this by hand, and you can change it back at any time.',
};

/** Shown under the dropdown. */
export const LEAD_STATUS_HINT =
  'You choose these yourself. Two also change on their own: when you make a join link for this family, ' +
  'and when they use it to join the troop.';
