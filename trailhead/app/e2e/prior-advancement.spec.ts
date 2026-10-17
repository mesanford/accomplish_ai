import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader records ranks and badges a new Scout earned before joining', async ({ browser }) => {
  const leader = await signedIn(browser, 'prior-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 303');
  await leader.getByLabel('Unit number').fill('303');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 303' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Jamie');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await leader.getByRole('link', { name: "Record Jamie's earlier ranks and badges" }).click();
  await expect(leader.getByRole('heading', { name: 'Record earlier advancement' })).toBeVisible();

  await leader.getByLabel('Tenderfoot date earned').fill('2023-02-01');
  await leader.getByLabel('Second Class date earned').fill('2023-08-01');
  await leader.getByLabel('First Class date earned').fill('2024-03-01');

  await leader.getByText('Paste a list instead').click();
  await leader.getByLabel('One badge per line, with its date').fill(
    ['Camping Merit Badge, 07/15/2024', 'First Aid 2024-04-10', 'Underwater Basket Weaving 5/1/2024'].join('\n'),
  );
  await leader.getByRole('button', { name: 'Add badges from list' }).click();
  await expect(leader.getByText(/One line still needs attention/)).toBeVisible();
  await expect(leader.getByLabel('Camping completed')).toHaveValue('2024-07-15');
  await expect(leader.getByLabel('First Aid completed')).toHaveValue('2024-04-10');

  await leader.getByLabel('Add a partly finished merit badge').selectOption('cooking');
  await leader.getByRole('button', { name: 'Choose requirements' }).click();
  await leader.getByLabel('Requirement 1 done').check();
  await leader.getByLabel('Requirement 2a done').check();
  await leader.getByLabel('Cooking last signed').fill('2025-06-01');
  // Swimming has no requirement file, so the app asks for a typed number and links to the official page.
  await leader.getByLabel('Add a partly finished merit badge').selectOption('swimming');
  await expect(leader.getByRole('link', { name: 'Official Swimming requirements' })).toBeVisible();
  await leader.getByLabel('Swimming requirements done').fill('3');
  await leader.getByLabel('Swimming last signed').fill('2025-05-01');

  await leader.getByRole('button', { name: 'Save earlier advancement' }).click();
  await expect(leader.getByText('Saved 3 rank dates and 4 merit badges.')).toBeVisible();

  await leader.getByRole('link', { name: 'Back to Jamie' }).click();
  await expect(leader.getByText('Current rank: First Class')).toBeVisible();
  await expect(leader.getByText(/Complete Jul 15, 2024/)).toBeVisible();
  await expect(leader.getByText(/Signed: 1, 2a/)).toBeVisible();
  await expect(leader.getByText(/Signed: 3/)).toBeVisible();
});
