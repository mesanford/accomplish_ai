import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

// Run with the storage emulator too:
//   firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead "npm --prefix app run e2e"
// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(resetEmulators);

test('a leader works with a counselor outside the troop and records a paper blue card', async ({ browser }) => {
  const leader = await signedIn(browser, 'paper-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 404');
  await leader.getByLabel('Unit number').fill('404');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 404' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByLabel('Current rank').selectOption('first-class');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();
  const parentInvite = await createInviteLink(leader, 'parent', 'Sam');
  const parent = await signedIn(browser, 'paper-parent@example.com', parentInvite);
  await joinAsParent(parent, 'Jordan Parent');

  // A blue card for Chess; the counselor is outside the troop, so the leader signs for them.
  await leader.getByRole('link', { name: 'Badges', exact: true }).click();
  await leader.getByLabel('Search badges').fill('chess');
  await leader.getByRole('button', { name: 'Start a blue card' }).click();
  await expect(leader.getByText('Blue card requested')).toBeVisible();
  await leader.getByRole('link', { name: 'Blue cards', exact: true }).click();
  await leader.getByRole('button', { name: 'Approve' }).click();
  await leader.getByLabel('Counselor', { exact: true }).selectOption({ label: 'Someone outside the troop' });
  await expect(leader.getByRole('button', { name: 'Assign' })).toBeDisabled();
  await leader.getByLabel('Counselor name').fill('Jordan Smith');
  await leader.getByLabel('Counselor email (optional)').fill('jordan@example.org');
  await leader.getByRole('button', { name: 'Assign' }).click();
  await expect(leader.getByText('Counselor: Jordan Smith (outside the troop)')).toBeVisible();
  await leader.getByRole('button', { name: 'Sign requirements for Jordan Smith' }).click();
  await leader.getByRole('button', { name: 'Sign requirement 1a' }).click();
  await expect(leader.getByRole('button', { name: 'Sign requirement 1a' })).toBeHidden();
  await leader.getByRole('button', { name: 'Mark Chess complete' }).click();
  await expect(leader.getByText('No open blue cards.')).toBeVisible();

  // The first Scoutbook report covers the Chess work.
  await leader.getByRole('link', { name: 'Scoutbook', exact: true }).click();
  await leader.getByRole('button', { name: 'Create handoff report' }).click();
  await expect(leader.getByRole('cell', { name: 'Pat Leader (for Jordan Smith, counselor)' }).first()).toBeVisible();

  // A paper blue card, signed weeks ago, with two signed requirements and a photo.
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByRole('link', { name: 'Sam', exact: true }).click();
  await leader.getByRole('link', { name: 'Record a paper blue card' }).click();
  await expect(leader.getByRole('heading', { name: 'Record a paper blue card' })).toBeVisible();
  await leader.getByLabel('Merit badge').selectOption('cooking');
  await leader.getByLabel("Counselor's name").fill('Lee Counselor');
  await leader.getByLabel('Started on').fill(daysAgo(90));
  await leader.getByLabel('Requirement 1 done').check();
  await leader.getByLabel('Requirement 2a done').check();
  await leader.getByLabel('Date for all of them').fill(daysAgo(60));
  await leader.getByLabel('Date signed for requirement 2a').fill(daysAgo(50));
  await leader.getByLabel('Photos of the paper card').setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: PNG });
  await leader.getByRole('button', { name: 'Save paper blue card' }).click();
  await expect(leader.getByText('The card is saved with 2 signed requirements.')).toBeVisible();

  // Sam's page shows the outside-counselor card, the paper card and its signatures, and the photo.
  await leader.getByRole('link', { name: 'Back to Sam' }).click();
  await expect(leader.getByText('Counselor: Jordan Smith (outside the troop)')).toBeVisible();
  await expect(leader.getByText(/Counselor: Lee Counselor \(outside the troop\) · Recorded from a paper card/)).toBeVisible();
  await expect(leader.getByText(/Signed by a leader for Lee Counselor \(counselor\): 1, 2a/)).toBeVisible();
  await expect(leader.getByText(/Signed by a leader for Jordan Smith \(counselor\): 1a/)).toBeVisible();
  await expect(leader.getByRole('img', { name: 'Paper card photo 1' })).toBeVisible();

  await parent.getByRole('link', { name: /Sam/ }).click();
  await expect(parent.getByText(/Counselor: Lee Counselor \(outside the troop\)/)).toBeVisible();
  await expect(parent.getByRole('img', { name: 'Paper card photo 1' })).toBeVisible();

  // The next Scoutbook report lists the paper card's items, though they were signed before the last report.
  await leader.getByRole('link', { name: 'Scoutbook', exact: true }).click();
  await leader.getByRole('button', { name: 'Create handoff report' }).click();
  await expect(leader.getByRole('cell', { name: 'Pat Leader (for Lee Counselor, counselor)' })).toHaveCount(2);
  await expect(leader.getByRole('cell', { name: 'Cooking' })).toHaveCount(2);
});
