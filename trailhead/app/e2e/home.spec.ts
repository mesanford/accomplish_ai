import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('the home screen offers what each person can do and shows what is happening', async ({ browser }) => {
  const leader = await signedIn(browser, 'home-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 606');
  await leader.getByLabel('Unit number').fill('606');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 606' })).toBeVisible();

  // A leader's choices, and an empty summary.
  const actions = leader.getByRole('region', { name: 'What do you want to do?' });
  for (const name of ['Plan an event', 'Send a message to the troop', 'Manage Scouts and families', 'Troop settings']) {
    await expect(actions.getByText(name, { exact: true })).toBeVisible();
  }
  const happening = leader.getByRole('region', { name: "What's happening" });
  await expect(happening.getByText('Nothing on the calendar in the next 14 days.')).toBeVisible();

  // Add a Scout and an event in the next two weeks; the summary and Coming up follow.
  await actions.getByText('Manage Scouts and families', { exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  const invite = await createInviteLink(leader, 'parent', 'Riley');
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event', { exact: true }).fill('Fall campout');
  await leader.getByLabel('Date').fill(inDays(5));
  await leader.getByRole('button', { name: 'Add event' }).click();
  await expect(leader.getByRole('link', { name: 'Fall campout' })).toBeVisible();

  // Schedule a message from the home screen's shortcut.
  await leader.getByRole('link', { name: 'Home', exact: true }).first().click();
  await actions.getByText('Send a message to the troop', { exact: true }).click();
  await leader.getByLabel('Title').fill('Court of honor');
  await leader.getByLabel('Message').fill('Sunday at 2 pm in the church hall.');
  await leader.getByLabel('Send later').check();
  await leader.getByRole('button', { name: 'Schedule' }).click();
  await expect(leader.getByText(/^Scheduled for /)).toBeVisible();
  await expect(leader.getByRole('region', { name: 'Scheduled' }).getByText('Court of honor')).toBeVisible();

  await leader.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(happening.getByText('Scheduled message', { exact: true })).toBeVisible();
  await expect(happening.getByText('0 of 1')).toBeVisible(); // Scouts with an advancement path
  await expect(happening.getByRole('link', { name: 'Fall campout' })).toBeVisible();

  // A parent gets family choices and sees the event coming up, not the leader summary.
  const parent = await signedIn(browser, 'home-parent@example.com', invite);
  await joinAsParent(parent, 'Jordan Parent');
  const theirs = parent.getByRole('region', { name: 'What do you want to do?' });
  await expect(theirs.getByText('Sign up for an event', { exact: true })).toBeVisible();
  await expect(theirs.getByText('Troop settings', { exact: true })).toHaveCount(0);
  await expect(parent.getByRole('link', { name: 'Fall campout' })).toBeVisible();
  await expect(parent.getByText('Scheduled message', { exact: true })).toHaveCount(0);
});
