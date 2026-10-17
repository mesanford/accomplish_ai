import { expect, test } from '@playwright/test';
import { consentLinkFor } from './consentEmail';
import { inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a young Scout needs a leader confirmation, a parent agrees to the notice, and can withdraw', async ({ browser }) => {
  const leader = await signedIn(browser, 'consent-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 202');
  await leader.getByLabel('Unit number').fill('202');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 202' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster' }).click();

  // A Scout who may be under 13 needs a parent's email (no leader confirmation); a 14-year-old needs none.
  const parentEmail = leader.locator('#add-parent-email-0');
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth month').selectOption('1');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 10));
  await expect(parentEmail).toBeVisible();
  await expect(leader.getByRole('checkbox', { name: /has given the troop permission/ })).toHaveCount(0);
  await leader.getByLabel('Birth year').fill('2012');
  await expect(parentEmail).toBeHidden();
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 10));
  await leader.locator('#add-parent-name-0').fill('Jordan Parent');
  await parentEmail.fill('consent-parent@example.com');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Riley', exact: true })).toBeVisible();
  await expect(leader.getByText('Waiting for parent consent')).toBeVisible();

  // The parent reads the notice for this troop and cannot join without agreeing.
  const invite = await consentLinkFor('consent-parent@example.com');
  const parent = await signedIn(browser, 'consent-parent@example.com', invite);
  await expect(parent.getByRole('heading', { name: 'Join your troop' })).toBeVisible();
  await expect(parent.getByText(/Troop 202 uses Forthright, run by MM Sanford/)).toBeVisible();
  const notice = parent.getByLabel('Notice to parents and guardians');
  await expect(notice.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy');
  await expect(notice.getByRole('link', { name: 'privacy@msanford.com' })).toBeVisible();
  await parent.getByLabel('Your name').fill('Jordan Parent');
  await parent.getByRole('button', { name: 'Join troop' }).click();
  await expect(parent.getByRole('heading', { name: 'Join your troop' })).toBeVisible();
  await joinAsParent(parent, 'Jordan Parent');

  // Leaders now see the consent; the parent withdraws it and leaders are told to remove the records.
  await leader.getByRole('link', { name: 'Roster' }).click();
  await expect(leader.getByText(/Parent consent: given/)).toBeVisible();
  await parent.getByRole('link', { name: /Riley/ }).click();
  await expect(parent.getByRole('heading', { name: 'Parent consent' })).toBeVisible();
  await parent.getByRole('button', { name: 'Withdraw consent' }).click();
  await parent.getByRole('button', { name: 'Withdraw consent for Riley' }).click();
  await expect(parent.getByText(/You withdrew consent/)).toBeVisible();
  await expect(leader.getByText(/A parent withdrew consent. Remove these Scouts' records/)).toBeVisible();
});
