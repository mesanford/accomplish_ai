import { expect, type Page, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

async function fillCreateForm(page: Page, name: string, unit: string, council: string, you: string) {
  await page.getByRole('link', { name: 'Create a troop' }).click();
  await page.getByLabel('Troop name').fill(name);
  await page.getByLabel('Unit number').fill(unit);
  await page.getByLabel('Council').fill(council);
  await page.getByLabel('Your name').fill(you);
  await page.getByLabel('Youth Protection training expires').fill(inOneYear());
}

test('a second leader finds the troop already here, asks to join, and a leader approves', async ({ browser }) => {
  const first = await signedIn(browser, 'dup-first@example.com');
  await fillCreateForm(first, 'Troop 1107', '1107', 'Bay-Lakes Council', 'Pat Leader');
  await first.getByRole('button', { name: 'Create troop' }).click();
  await expect(first.getByRole('heading', { name: 'Troop 1107' })).toBeVisible();

  // The same number in the same council, typed a little differently, is offered instead of a second copy.
  const second = await signedIn(browser, 'dup-second@example.com');
  await fillCreateForm(second, 'Scouting America Troop 1107', '1107', 'Bay Lakes', 'Robin Helper');
  await second.getByLabel('Your role in the troop').selectOption('committee_member');
  await second.getByRole('button', { name: 'Create troop' }).click();
  const found = second.getByRole('region', { name: 'Already on Forthright' });
  await expect(found.getByText('This troop is already on Forthright')).toBeVisible();
  await expect(second.getByText('This troop may already be on Forthright.')).toBeVisible();
  await found.getByRole('button', { name: 'Ask to join' }).click();
  await expect(second.getByRole('heading', { name: 'Troop 1107' })).toBeVisible();
  await expect(second.getByLabel('Your name')).toHaveValue('Robin Helper');
  await second.getByRole('button', { name: 'Send request' }).click();
  await expect(second.getByRole('heading', { name: 'Request sent' })).toBeVisible();
  await second.getByRole('link', { name: 'Go to your home page' }).click();
  await expect(second.getByText("You asked to join. Waiting for one of the troop's leaders")).toBeVisible();

  // The troop's leader sees the request on the home page and approves it on the Roster with the role asked for.
  await first.reload();
  await first.getByRole('link', { name: /1 person asked to join the troop/ }).click();
  const asking = first.getByRole('region', { name: 'Asking to join' });
  await expect(asking.getByLabel('Role')).toHaveValue('committee_member');
  await asking.getByRole('button', { name: 'Approve Robin Helper' }).click();
  await expect(asking).toHaveCount(0);
  await expect(first.getByRole('button', { name: 'Change roles for Robin Helper' })).toBeVisible();
  await expect(first.getByText(/Robin Helper · Leader and committee member/)).toBeVisible();

  // Robin's one troop is now Troop 1107, so the home page opens it.
  await second.reload();
  await expect(second.getByRole('heading', { name: 'Troop 1107' })).toBeVisible();
});

test('a different troop with the same number is created anyway, then deleted from Troop settings', async ({
  browser,
}) => {
  // Each test makes its own troops: a failed test restarts the worker, which resets the emulators.
  const boys = await signedIn(browser, 'dup-boys@example.com');
  await fillCreateForm(boys, 'Troop 2207 Boys', '2207B', 'Bay-Lakes Council', 'Lee Leader');
  await boys.getByRole('button', { name: 'Create troop' }).click();
  await expect(boys.getByRole('heading', { name: 'Troop 2207 Boys' })).toBeVisible();

  const leader = await signedIn(browser, 'dup-girls@example.com');
  await fillCreateForm(leader, 'Troop 2207 Girls', '2207G', 'Bay-Lakes Council', 'Sam Leader');
  await leader.getByRole('button', { name: 'Create troop' }).click();
  const found = leader.getByRole('region', { name: 'Already on Forthright' });
  await expect(found.getByText('Unit 2207B · Bay-Lakes Council')).toBeVisible();
  await found.getByLabel('This is not my troop. Create mine.').check();
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 2207 Girls' })).toBeVisible();

  await leader.getByRole('link', { name: 'Troop settings', exact: true }).click();
  const danger = leader.getByRole('region', { name: 'Delete this troop' });
  await danger.getByRole('button', { name: 'Delete this troop' }).click();
  await danger.getByRole('button', { name: 'Yes, delete Troop 2207 Girls for good' }).click();
  await expect(leader.getByRole('heading', { name: 'Your troops' })).toBeVisible();
  await expect(leader.getByText("You're not in a troop yet.")).toBeVisible();
});
