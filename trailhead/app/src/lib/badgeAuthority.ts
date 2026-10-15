/** Who may change merit badge records: the Scoutmaster and the advancement chair, plus a badge's assigned counselor
 * for that badge's requirements. Ranks and troop awards keep the leader rule. The server and the security rules enforce
 * this; the app hides what a person can no longer do and says why. */

export const BADGE_MANAGER_NOTE =
  'Only the Scoutmaster or advancement chair can approve blue cards, assign counselors, add card photos and record paper blue cards.';

export const SIGNOFF_NOTE = "Only the Scoutmaster, advancement chair or the badge's counselor can sign merit badge requirements.";

export const PRIOR_BADGES_NOTE = 'Only the Scoutmaster or advancement chair can record merit badges earned earlier. You can still record ranks.';

export const START_CARD_NOTE = 'Only the Scoutmaster or advancement chair can start a blue card for a Scout.';
