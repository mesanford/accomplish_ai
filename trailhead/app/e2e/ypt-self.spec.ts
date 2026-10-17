import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('an adult enters their own Youth Protection date and the roster says they did', async ({ browser }) => {
  const adult = await signedIn(browser, 'ypt-self@example.com');
  await adult.setViewportSize({ width: 375, height: 800 });
  await adult.getByRole('link', { name: 'Create a troop' }).click();
  await adult.getByLabel('Troop name').fill('Troop 505');
  await adult.getByLabel('Unit number').fill('505');
  await adult.getByLabel('Your name').fill('Pat Leader');
  await adult.getByLabel('Youth Protection training expires').fill(inOneYear());
  await adult.getByRole('button', { name: 'Create troop' }).click();
  await expect(adult.getByRole('heading', { name: 'Troop 505' })).toBeVisible();

  await adult.getByRole('link', { name: 'Account' }).click();
  const form = adult.getByRole('form', { name: 'Youth Protection date for Troop 505' });
  const newDate = new Date();
  newDate.setFullYear(newDate.getFullYear() + 2);
  await form.getByLabel('Youth Protection expiry date for Troop 505').fill(newDate.toISOString().slice(0, 10));
  await form.getByRole('button', { name: 'Save date for Troop 505' }).click();
  await expect(form.getByText('Saved.')).toBeVisible();
  expect(await adult.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true);

  // A date that has passed is refused before it is sent.
  await form.getByLabel('Youth Protection expiry date for Troop 505').fill('2020-01-01');
  await form.getByRole('button', { name: 'Save date for Troop 505' }).click();
  await expect(form.getByText('Enter an expiry date that has not passed.')).toBeVisible();

  await adult.goBack();
  await adult.getByRole('link', { name: 'Roster' }).click();
  await expect(adult.getByText('Entered by them')).toBeVisible();
});
