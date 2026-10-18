import { describe, expect, it } from 'vitest';
import { STATUS_LABELS } from '../eventSignups';
import { CONSENT_LABELS } from '../site';
import { VISIBILITY_LABELS } from '../siteDocs';
import {
  ACTIVITY_TIP,
  AWARD_FINISHED_TIP,
  CARD_TIP,
  DISCONTINUED_TIP,
  DOCUMENT_TIP,
  EAGLE_GROUP_TIP,
  EAGLE_REQUIRED_TIP,
  PATH_TIP,
  PHOTO_TIP,
  REQUIREMENT_TIP,
  SIGNUP_TIP,
} from '../moreStatusTips';

const CARD_LABELS = ['Requested', 'Approved', 'Counselor assigned', 'In progress', 'Complete', 'Cancelled'];
const PATH_LABELS = ['On track', 'At risk', "Won't work as planned"];
const REQUIREMENT_LABELS = ['Signed', 'Ready for sign-off', 'Needs review', 'Complete'];
const ACTIVITY_LABELS = ['Waiting for a leader', 'Not accepted'];
const BADGE_LABELS = ['Eagle required', 'Eagle:', 'Discontinued', 'finish by'];

/** Words that appear on buttons or text beside the pills, which tests look up by substring. */
const NEARBY = {
  card: ['approve', 'cancel', 'request', 'complete', 'start working', 'in progress', 'counselor:'],
  requirement: ['signed', 'sign-off', 'needs review', 'complete', 'carried over', 'new'],
  activity: ['approve', 'reject', 'waiting for', 'not accepted'],
  signup: ['going', 'waitlist', 'permission', 'waiting for'],
  badge: ['eagle required', 'eagle:', 'discontinued', 'finish by'],
  photo: ['media consent', 'consent'],
  document: ['leaders only', 'public:', 'members:'],
  path: ["won't work", 'on track', 'at risk'],
};

function check(tips: string[], labels: string[], nearby: string[]) {
  for (const tip of tips) {
    expect(tip.length).toBeGreaterThan(20);
    const lower = tip.toLowerCase();
    for (const word of [...labels, ...nearby]) {
      expect(lower, `"${tip}" contains "${word}"`).not.toContain(word.toLowerCase());
    }
  }
}

describe('more status explanations', () => {
  it('explains every blue card status without using any status word', () => {
    expect(Object.keys(CARD_TIP)).toHaveLength(6);
    check(Object.values(CARD_TIP), CARD_LABELS, NEARBY.card);
  });

  it('explains every path status without using any status word', () => {
    expect(Object.keys(PATH_TIP)).toHaveLength(3);
    check(Object.values(PATH_TIP), PATH_LABELS, NEARBY.path);
  });

  it('explains every requirement status without using any status word', () => {
    check([...Object.values(REQUIREMENT_TIP), AWARD_FINISHED_TIP], REQUIREMENT_LABELS, NEARBY.requirement);
  });

  it('says whether an activity entry counts yet', () => {
    check(Object.values(ACTIVITY_TIP), ACTIVITY_LABELS, NEARBY.activity);
    expect(ACTIVITY_TIP.pending).toMatch(/before .*totals/);
    expect(ACTIVITY_TIP.rejected).toMatch(/not counted/);
  });

  it('explains every event sign-up status without repeating the labels', () => {
    expect(Object.keys(SIGNUP_TIP).sort()).toEqual(Object.keys(STATUS_LABELS).sort());
    check(Object.values(SIGNUP_TIP), Object.values(STATUS_LABELS), NEARBY.signup);
  });

  it('explains the badge labels without repeating them', () => {
    check([EAGLE_REQUIRED_TIP, EAGLE_GROUP_TIP, DISCONTINUED_TIP], BADGE_LABELS, NEARBY.badge);
  });

  it('explains every photo permission pill without repeating the labels', () => {
    expect(Object.keys(PHOTO_TIP).sort()).toEqual(Object.keys(CONSENT_LABELS).sort());
    check(Object.values(PHOTO_TIP), Object.values(CONSENT_LABELS).map(([label]) => label), NEARBY.photo);
  });

  it('explains every document visibility without repeating the labels, and says public means anyone online', () => {
    expect(Object.keys(DOCUMENT_TIP).sort()).toEqual(Object.keys(VISIBILITY_LABELS).sort());
    check(Object.values(DOCUMENT_TIP), Object.values(VISIBILITY_LABELS), NEARBY.document);
    expect(DOCUMENT_TIP.public).toContain('anyone on the internet');
  });
});
