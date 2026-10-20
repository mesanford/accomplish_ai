import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, join, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a treasurer posts popcorn sales and the parent sees the credit', async ({ browser }) => {
  const leader = await signedIn(browser, 'acct-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 505');
  await leader.getByLabel('Unit number').fill('505');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 505' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();
  const treasurerInvite = await createInviteLink(leader, 'treasurer');
  const parentInvite = await createInviteLink(leader, 'parent', 'Sam');

  // The treasurer needs no Youth Protection date for this role and sees the Accounts page.
  const treasurer = await signedIn(browser, 'acct-treasurer@example.com', treasurerInvite);
  await join(treasurer, 'Terry Treasurer');
  await expect(treasurer.getByRole('heading', { name: 'Troop 505' })).toBeVisible();
  await treasurer.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(treasurer.getByRole('heading', { name: 'Accounts' })).toBeVisible();

  await treasurer.getByRole('link', { name: 'New fundraiser' }).click();
  await treasurer.getByLabel('Fundraiser name').fill('Fall popcorn 2026');
  await treasurer.getByLabel('Credit rule').selectOption('percent');
  await treasurer.getByLabel('Percent of sales').fill('30');
  await treasurer.getByLabel('Sales for Sam').fill('100');
  await expect(treasurer.getByText("30% of each Scout's sales goes to their account.")).toBeVisible();
  await treasurer.getByRole('button', { name: 'Post credits to accounts' }).click();
  await expect(treasurer.getByText('Posted. 1 Scout account credited $30.00 in all.')).toBeVisible();

  // The summary shows the money held, with tabular amounts.
  await treasurer.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(treasurer.getByRole('row', { name: /Sam \$30\.00 \$0\.00/ })).toBeVisible();
  await expect(treasurer.getByRole('row', { name: /Fall popcorn 2026/ })).toContainText('$100.00');

  // The parent sees Sam's balance and the credit on Sam's page, and cannot open the troop's accounts.
  const parent = await signedIn(browser, 'acct-parent@example.com', parentInvite);
  await joinAsParent(parent, 'Jordan Parent');
  await expect(parent.getByRole('link', { name: 'Accounts', exact: true })).toBeHidden();
  await parent.getByRole('link', { name: /Sam/ }).first().click();
  const account = parent.getByRole('region', { name: 'Scout account' });
  await expect(account.getByText('Account balance')).toBeVisible();
  await expect(account.getByText('$30.00').first()).toBeVisible();
  await expect(account.getByText('Fall popcorn 2026: credit on sales of $100.00')).toBeVisible();
  await expect(account.getByRole('button', { name: 'Reverse' })).toBeHidden();
});
