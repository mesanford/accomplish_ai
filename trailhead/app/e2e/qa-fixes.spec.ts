import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('required forms explain what is missing, and Badges works on a deep link and a phone', async ({ browser }) => {
  const leader = await signedIn(browser, 'qa-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  // An empty form says what is still needed, on the page.
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByText(/Still needed: the troop name, the unit number/)).toBeVisible();
  await leader.getByLabel('Troop name').fill('Troop 202');
  await leader.getByLabel('Unit number').fill('202');
  await leader.getByLabel('Your name').fill('Quinn Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 202' })).toBeVisible();
  const troopUrl = new URL(leader.url()).pathname;

  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByText(/Still needed: the Scout's name and the birth year/)).toBeVisible();
  await leader.getByLabel("Scout's name").fill('Robin');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Robin', exact: true })).toBeVisible();

  // Opening Badges by address (nothing loaded yet) still starts a blue card for the right Scout.
  await leader.goto(`${troopUrl}/badges`);
  await expect(leader.getByRole('heading', { name: 'Badges' })).toBeVisible();
  await expect(leader.getByRole('button', { name: 'Show more badges' })).toBeVisible();
  await expect(leader.locator('article.card')).toHaveCount(30);
  await leader.getByRole('button', { name: 'Show more badges' }).click();
  await expect(leader.locator('article.card')).toHaveCount(60);
  await leader.getByLabel('Search badges').fill('chess');
  await expect(leader.getByRole('button', { name: 'Show more badges' })).toBeHidden();
  await leader.getByRole('button', { name: 'Start a blue card' }).click();
  await expect(leader.getByText('Blue card requested')).toBeVisible();
  await leader.getByRole('button', { name: 'Start a blue card' }).click();
  await expect(leader.getByText('There is already a blue card for this badge.')).toBeVisible();

  // No sideways scrolling on a phone.
  await leader.setViewportSize({ width: 375, height: 800 });
  await leader.getByLabel('Search badges').fill('');
  const overflow = await leader.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
