import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, join, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('an assistant leader sees blue cards and merit badges read-only until the Scoutmaster gives them the role', async ({ browser }) => {
  // Whoever creates the troop is its Scoutmaster.
  const scoutmaster = await signedIn(browser, 'sm-lead@example.com');
  await scoutmaster.getByRole('link', { name: 'Create a troop' }).click();
  await scoutmaster.getByLabel('Troop name').fill('Troop 505');
  await scoutmaster.getByLabel('Unit number').fill('505');
  await scoutmaster.getByLabel('Your name').fill('Pat Scoutmaster');
  await scoutmaster.getByLabel('Youth Protection training expires').fill(inOneYear());
  await scoutmaster.getByRole('button', { name: 'Create troop' }).click();
  await expect(scoutmaster.getByRole('heading', { name: 'Troop 505' })).toBeVisible();

  await scoutmaster.getByRole('link', { name: 'Roster', exact: true }).click();
  await expect(scoutmaster.getByText('Leader and Scoutmaster')).toBeVisible();
  await scoutmaster.getByLabel("Scout's name").fill('Sam');
  await scoutmaster.getByLabel('Birth month').selectOption('3');
  await scoutmaster.getByLabel('Birth year').fill('2012');
  await scoutmaster.getByLabel('Current rank').selectOption('first-class');
  await scoutmaster.getByRole('button', { name: 'Add Scout' }).click();
  await expect(scoutmaster.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();

  // The Scoutmaster starts a blue card, then invites an assistant leader.
  await scoutmaster.getByRole('link', { name: 'Badges', exact: true }).click();
  await scoutmaster.getByLabel('Search badges').fill('chess');
  await scoutmaster.getByRole('button', { name: 'Start a blue card' }).click();
  await expect(scoutmaster.getByText('Blue card requested')).toBeVisible();
  await scoutmaster.getByRole('link', { name: 'Roster', exact: true }).click();
  const invite = await createInviteLink(scoutmaster, 'leader');
  const assistant = await signedIn(browser, 'sm-assistant@example.com', invite);
  await join(assistant, 'Alex Assistant', inOneYear());

  // The assistant sees the open card, a short note, and no buttons to change it.
  await assistant.getByRole('link', { name: 'Blue cards', exact: true }).click();
  await expect(assistant.getByText(/Only the Scoutmaster or advancement chair can approve blue cards/)).toBeVisible();
  await expect(assistant.getByText('Sam · Chess')).toBeVisible();
  await expect(assistant.getByRole('button', { name: 'Approve' })).toBeHidden();
  await expect(assistant.getByRole('button', { name: 'Cancel' })).toBeHidden();
  await expect(assistant.getByRole('heading', { name: 'A Scout brought a paper blue card?' })).toBeHidden();

  // On Sam's page they can sign ranks but not merit badge requirements, and cannot record paper cards.
  await assistant.getByRole('link', { name: 'Roster', exact: true }).click();
  await assistant.getByRole('link', { name: 'Sam', exact: true }).click();
  await expect(assistant.getByText("Only the Scoutmaster, advancement chair or the badge's counselor can sign merit badge requirements.")).toBeVisible();
  await expect(assistant.locator('#so-award')).toBeVisible();
  await expect(assistant.locator('optgroup[label="Merit badges"]')).toHaveCount(0);
  await expect(assistant.getByRole('link', { name: 'Record a paper blue card' })).toBeHidden();
  await expect(assistant.getByRole('link', { name: 'Record earlier ranks', exact: true })).toBeVisible();

  // The Scoutmaster makes the assistant a Scoutmaster too. The page updates without a reload.
  await scoutmaster.getByRole('link', { name: 'Roster', exact: true }).click();
  await scoutmaster.getByRole('button', { name: 'Change roles for Alex Assistant' }).click();
  const form = scoutmaster.getByRole('form', { name: 'Roles for Alex Assistant' });
  await form.getByRole('checkbox', { name: 'Scoutmaster' }).check();
  await form.getByRole('button', { name: 'Save roles' }).click();
  await expect(scoutmaster.getByText("Saved Alex Assistant's roles.")).toBeVisible();

  await assistant.getByRole('link', { name: 'Blue cards', exact: true }).click();
  await expect(assistant.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(assistant.getByRole('heading', { name: 'A Scout brought a paper blue card?' })).toBeVisible();
});
