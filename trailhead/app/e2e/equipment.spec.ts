import { expect, test } from '@playwright/test';
import {
  createInviteLink,
  inOneYear,
  join,
  joinAsParent,
  resetEmulators,
  signedIn,
} from './helpers';

test.beforeAll(resetEmulators);

test('a quartermaster adds a tent, checks it out to a Scout and checks it back in', async ({
  browser,
}) => {
  const leader = await signedIn(browser, 'gear-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 606');
  await leader.getByLabel('Unit number').fill('606');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 606' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();
  const quartermasterInvite = await createInviteLink(leader, 'quartermaster');
  const parentInvite = await createInviteLink(leader, 'parent', 'Sam');

  // The quartermaster needs no Youth Protection date and sees Equipment, but nothing leader-only.
  const qm = await signedIn(browser, 'gear-qm@example.com', quartermasterInvite);
  await join(qm, 'Quinn Quartermaster');
  await expect(qm.getByRole('heading', { name: 'Troop 606' })).toBeVisible();
  await expect(qm.getByRole('link', { name: 'Roster' })).toBeHidden();
  await qm.getByRole('link', { name: 'Equipment' }).click();
  await expect(qm.getByRole('heading', { name: 'Equipment' })).toBeVisible();

  await qm.getByRole('button', { name: 'Add an item' }).click();
  const addForm = qm.getByRole('form', { name: 'Add an item' });
  await addForm.getByLabel('Name', { exact: true }).fill('Tent 4');
  await addForm.getByLabel('Category').selectOption('tents');
  await addForm.getByLabel('Asset tag (optional)').fill('T-4');
  await addForm.getByLabel('Location').fill('Trailer');
  await expect(
    qm.getByText('Photos of gear only. Do not include Scouts or other people.'),
  ).toBeVisible();
  await qm.getByRole('button', { name: 'Add item' }).click();
  await expect(qm.getByRole('link', { name: 'Tent 4' })).toBeVisible();
  await expect(qm.getByText('On the shelf', { exact: true })).toBeVisible();

  // Check it out to Sam.
  await qm.getByRole('link', { name: 'Tent 4' }).click();
  await qm.getByRole('button', { name: 'Check out' }).first().click();
  await qm.getByLabel('Person').selectOption({ label: 'Sam (Scout)' });
  await qm.getByRole('button', { name: 'Check out' }).last().click();
  await expect(qm.getByRole('region', { name: 'Checked out' }).getByText('Sam')).toBeVisible();
  await expect(qm.getByRole('button', { name: 'Check out' })).toBeDisabled(); // a single tent is out

  // Sam's parent sees the loan.
  const parent = await signedIn(browser, 'gear-parent@example.com', parentInvite);
  await joinAsParent(parent, 'Jordan Parent');
  await parent.getByRole('link', { name: 'Equipment' }).click();
  await parent.getByRole('button', { name: 'Checked out to you' }).click();
  await expect(
    parent.getByRole('region', { name: 'Checked out to you' }).getByText('Tent 4'),
  ).toBeVisible();
  await expect(parent.getByRole('button', { name: 'Add an item' })).toBeHidden();

  // Check it back in, needing repair, and see it in the repair log.
  await qm.getByRole('button', { name: 'Check in Tent 4' }).click();
  await qm.getByLabel('Condition now').selectOption('needs_repair');
  await qm.getByLabel('Note (optional)').fill('Torn flap');
  await qm.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(qm.getByText('None of this item is checked out.')).toBeVisible();
  await expect(qm.getByRole('region', { name: 'Repair log' }).getByText(/Torn flap/)).toBeVisible();
  await expect(qm.getByText('Needs repair').first()).toBeVisible();
});
