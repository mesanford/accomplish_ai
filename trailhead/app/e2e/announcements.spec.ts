import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader posts an announcement to parents, a parent reads it, and the leader edits and deletes it', async ({ browser }) => {
  const leader = await signedIn(browser, 'ann-leader@example.com');
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

  const parent = await signedIn(browser, 'ann-parent@example.com', parentInvite);
  await joinAsParent(parent, 'Jordan Parent');
  await expect(parent.getByRole('link', { name: 'Announcements' })).toBeVisible();
  // A parent cannot post.
  await parent.getByRole('link', { name: 'Announcements' }).click();
  await expect(parent.getByRole('heading', { name: 'Announcements' })).toBeVisible();
  await expect(parent.getByRole('button', { name: 'New announcement' })).toBeHidden();
  await parent.getByRole('link', { name: 'Home' }).click();

  // The leader posts to all parents.
  await leader.getByRole('link', { name: 'Announcements' }).click();
  await leader.getByRole('button', { name: 'New announcement' }).click();
  await expect(leader.getByText(/Only adults with current Youth Protection training can post/)).toBeVisible();
  await leader.getByLabel('Title').fill('Campout packing list');
  await leader.getByLabel('Who is this for?').selectOption('parents');
  await leader.getByLabel('Message').fill('Bring a warm coat and a water bottle.');
  await leader.getByRole('checkbox', { name: 'Pin to the top' }).check();
  await leader.getByRole('button', { name: 'Post' }).click();
  await expect(leader.getByText('Posted.')).toBeVisible();
  await expect(leader.getByRole('heading', { name: 'Campout packing list' })).toBeVisible();
  await expect(leader.getByText('Pinned', { exact: true })).toBeVisible();

  // The parent sees the newest unread announcement on Home, then in the feed with the New marker.
  await expect(parent.getByText('New announcement', { exact: true })).toBeVisible();
  await expect(parent.getByText(/Bring a warm coat/)).toBeVisible();
  await parent.getByRole('link', { name: /Campout packing list/ }).click();
  await expect(parent.getByRole('heading', { name: 'Campout packing list' })).toBeVisible();
  await expect(parent.getByText('New', { exact: true })).toBeVisible();
  await expect(parent.getByText('Pat Leader')).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Edit' })).toBeHidden();
  // Opening the feed marks it read: the Home card goes away.
  await parent.getByRole('link', { name: 'Home' }).click();
  await expect(parent.getByText('New announcement', { exact: true })).toBeHidden();

  // The leader edits it. The edit is marked.
  await leader.getByRole('button', { name: 'Edit' }).click();
  await leader.getByLabel('Message').fill('Bring a warm coat, a water bottle and a flashlight.');
  await leader.getByRole('button', { name: 'Save changes' }).click();
  await expect(leader.getByText(/flashlight/)).toBeVisible();
  await expect(leader.getByText(/Edited/)).toBeVisible();

  // Then deletes it, which asks first.
  await leader.getByRole('button', { name: 'Delete' }).click();
  await leader.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(leader.getByRole('heading', { name: 'Campout packing list' })).toBeHidden();
});

test('the announcement form and feed fit a phone screen, and the Account page has the email setting', async ({ browser }) => {
  const leader = await signedIn(browser, 'ann-phone@example.com');
  await leader.setViewportSize({ width: 375, height: 800 });
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 405');
  await leader.getByLabel('Unit number').fill('405');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 405' })).toBeVisible();
  await leader.getByRole('link', { name: 'Announcements' }).click();
  await leader.getByRole('button', { name: 'Write an announcement' }).click();
  await leader.getByLabel('Type').selectOption('newsletter');
  await expect(leader.getByRole('button', { name: 'Add a section' })).toBeVisible();
  const overflow = await leader.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await leader.goto('/account');
  const toggle = leader.getByRole('checkbox', { name: 'Email me troop announcements and newsletters' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
});
