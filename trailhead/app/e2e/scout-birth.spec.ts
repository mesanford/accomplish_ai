import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader corrects a Scout’s birth month and year, and a date under 13 waits for a parent', async ({ browser }) => {
  const leader = await signedIn(browser, 'birth-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 606');
  await leader.getByLabel('Unit number').fill('606');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 606' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Eli');
  await leader.getByLabel('Birth month').selectOption('1');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 15));
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await leader.getByRole('link', { name: 'Eli', exact: true }).click();

  const form = leader.getByRole('form', { name: 'Birth month and year' });
  await form.getByLabel('Birth month').selectOption('6');
  await form.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
  await form.getByRole('button', { name: 'Save birth month and year' }).click();
  await expect(form.getByText('Saved.', { exact: true })).toBeVisible();

  // Eli has no parent consent, so a date that may make him under 13 puts him on hold: his page now asks for a parent.
  await form.getByLabel('Birth year').fill(String(new Date().getFullYear() - 11));
  await form.getByRole('button', { name: 'Save birth month and year' }).click();
  await expect(leader.getByText('Needs parent consent', { exact: true })).toBeVisible();
  await expect(leader.getByLabel('Parent or guardian email')).toBeVisible();
  await expect(form).toBeHidden();
});
