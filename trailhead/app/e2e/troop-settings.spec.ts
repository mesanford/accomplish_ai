import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader picks a time zone, then changes the troop details and positions in Troop settings', async ({
  browser,
}) => {
  const leader = await signedIn(browser, 'settings-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 505');
  await leader.getByLabel('Unit number').fill('505');
  await leader.getByLabel('Time zone').selectOption('America/Denver');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 505' })).toBeVisible();

  await leader.getByRole('link', { name: 'Troop settings', exact: true }).click();
  const details = leader.getByRole('region', { name: 'Troop details' });
  await expect(details.getByLabel('Time zone')).toHaveValue('America/Denver');
  await details.getByLabel('Troop name').fill('Troop 505 Boise');
  await details.getByLabel('District').fill('Treasure Valley');
  await details.getByLabel('Place').fill('Community center');
  await details.getByLabel('City').fill('Boise');
  await details.getByLabel('State').fill('ID');
  await details.getByLabel('ZIP code').fill('83702');
  await details.getByLabel('Time zone').selectOption('America/Los_Angeles');
  await details.getByRole('button', { name: 'Save troop details' }).click();
  await expect(details.getByText('Saved.')).toBeVisible();
  await expect(leader.getByText('Troop 505 Boise · Unit 505')).toBeVisible(); // the troop name in the page header

  const leadership = leader.getByRole('region', { name: 'Leadership' });
  await expect(leadership.getByText('Scoutmaster:')).toBeVisible();
  await expect(leadership.getByText('Pat Leader').first()).toBeVisible();
  await leadership.getByLabel('Committee chair').selectOption({ label: 'Pat Leader' });
  await leadership.getByRole('button', { name: 'Save positions' }).click();
  await expect(leadership.getByText('Saved.')).toBeVisible();

  // Reload: everything stuck, including the zone and the district saved by the other form.
  await leader.reload();
  const again = leader.getByRole('region', { name: 'Troop details' });
  await expect(again.getByLabel('Time zone')).toHaveValue('America/Los_Angeles');
  await expect(again.getByLabel('District')).toHaveValue('Treasure Valley');
  await expect(leader.getByRole('region', { name: 'Leadership' }).getByLabel('Committee chair')).not.toHaveValue('');
});
