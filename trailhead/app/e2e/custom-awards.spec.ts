import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader makes a troop award, changes it, moves a Scout to the new version, and the Scout completes it', async ({ browser }) => {
  const leader = await signedIn(browser, 'awards-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 202');
  await leader.getByLabel('Unit number').fill('202');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 202' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByLabel('Current rank').selectOption('scout');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();

  // Create an award with three requirements.
  await leader.getByRole('link', { name: 'Troop awards' }).click();
  await leader.getByRole('button', { name: 'New award' }).click();
  await leader.getByLabel('Award name').fill('First-Year Trail');
  await leader.getByLabel('Requirement 1, what the Scout does').fill('Attend three troop meetings.');
  await leader.getByRole('button', { name: 'Add requirement' }).click();
  await expect(leader.getByLabel('Requirement 2 number')).toHaveValue('2');
  await leader.getByLabel('Requirement 2, what the Scout does').fill('Help plan a campout menu.');
  await leader.getByRole('button', { name: 'Add requirement' }).click();
  await leader.getByLabel('Requirement 3, what the Scout does').fill('Lead a game at a troop meeting.');
  await leader.getByRole('button', { name: 'Create award' }).click();
  await expect(leader.getByRole('heading', { name: 'First-Year Trail' })).toBeVisible();
  await expect(leader.getByText('Version 1 (current)')).toBeVisible();

  // Sign two of the three requirements by picking them from the list on Sam's page.
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByRole('link', { name: 'Sam', exact: true }).click();
  await leader.getByRole('button', { name: 'Sign troop award requirement' }).click();
  await expect(leader.getByText('Signed First-Year Trail requirement 1.')).toBeVisible();
  await expect(leader.getByText('1 of 3 signed · Version 1')).toBeVisible();
  await leader.getByLabel('Troop award requirement').selectOption({ label: '2. Help plan a campout menu.' });
  await leader.getByRole('button', { name: 'Sign troop award requirement' }).click();
  await expect(leader.getByText('2 of 3 signed · Version 1')).toBeVisible();

  // Reword requirement 2 and add a fourth. That makes version 2; Sam stays on version 1.
  await leader.getByRole('link', { name: 'Troop awards' }).click();
  await leader.getByRole('link', { name: 'First-Year Trail' }).click();
  await leader.getByLabel('Requirement 2, what the Scout does').fill('Plan and cook a campout menu.');
  await leader.getByRole('button', { name: 'Add requirement' }).click();
  await leader.getByLabel('Requirement 4, what the Scout does').fill('Teach a younger Scout a knot.');
  await expect(leader.getByText('Saving creates a new version')).toBeVisible();
  await leader.getByRole('button', { name: 'Save changes' }).click();
  await expect(leader.getByText('Saved as version 2.')).toBeVisible();

  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByRole('link', { name: 'Sam', exact: true }).click();
  await expect(leader.getByText(/Sam is on version 1/)).toBeVisible();
  await leader.getByRole('button', { name: 'Move to latest version' }).click();
  await expect(leader.getByText(/Carried over: 1\. Needs review, because the wording changed: 2\./)).toBeVisible();
  await expect(leader.getByText('1 of 4 signed · Version 2')).toBeVisible();
  const card = leader.getByRole('article', { name: 'First-Year Trail' });
  await expect(card.getByText('Plan and cook a campout menu.')).toBeVisible();
  await expect(card.getByText('Needs review', { exact: true })).toBeVisible();

  // Signing the remaining requirements completes the award.
  for (const label of ['2. Plan and cook a campout menu.', '3. Lead a game at a troop meeting.', '4. Teach a younger Scout a knot.']) {
    await leader.getByLabel('Troop award requirement').selectOption({ label });
    await leader.getByRole('button', { name: 'Sign troop award requirement' }).click();
    await expect(leader.getByText(new RegExp(`Signed First-Year Trail requirement ${label[0]}\\.`))).toBeVisible();
  }
  await expect(card.getByText(/^Complete /)).toBeVisible();
});
