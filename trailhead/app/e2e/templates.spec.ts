import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, join, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader adds starter templates and a parent starts a Scout from one', async ({ browser }) => {
  const leader = await signedIn(browser, 'leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 202');
  await leader.getByLabel('Unit number').fill('202');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 202' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByLabel('Current rank').selectOption('tenderfoot');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();
  const parentInvite = await createInviteLink(leader, 'parent', 'Sam');

  // The leader copies the starter templates into the troop.
  await leader.getByRole('link', { name: 'Path templates' }).click();
  await leader.getByRole('button', { name: 'Add starter templates' }).click();
  await expect(leader.getByRole('heading', { name: 'First summer at camp' })).toBeVisible();
  await expect(leader.getByRole('heading', { name: 'Star in about a year' })).toBeVisible();

  // The parent applies one to Sam, saves, and sees whether the plan works.
  const parent = await signedIn(browser, 'parent@example.com', parentInvite);
  await join(parent, 'Jordan Parent');
  await parent.getByRole('link', { name: /Sam/ }).click();
  await parent.getByRole('link', { name: 'Plan a path' }).click();
  await parent.getByLabel('Start from a template').selectOption({ label: 'First summer at camp' });
  await expect(parent.getByText('This adds 4 badges')).toBeVisible();
  await parent.getByRole('button', { name: 'Replace current plan' }).click();
  await expect(parent.getByRole('status')).toContainText('Added 4 badges');
  await expect(parent.getByLabel('Swimming start')).not.toHaveValue('');
  await parent.getByRole('button', { name: 'Save plan' }).click();
  await expect(parent.getByRole('heading', { name: 'Path to First Class' })).toBeVisible();
  await expect(parent.getByText(/On track|At risk|Won't work as planned/).first()).toBeVisible();
});
