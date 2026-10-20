import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('a parent records Parts A and B and a leader sees the event roster flag clear', async ({ browser }) => {
  const leader = await signedIn(browser, 'health-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 404');
  await leader.getByLabel('Unit number').fill('404');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 404' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  for (const name of ['Riley', 'Sam']) {
    await leader.getByLabel("Scout's name").fill(name);
    await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
    await leader.getByRole('button', { name: 'Add Scout' }).click();
    await expect(leader.getByRole('link', { name, exact: true })).toBeVisible();
  }
  // Nobody has a health form yet, and the roster says so.
  await expect(leader.getByText('Health A and B: missing').first()).toBeVisible();
  const invite = await createInviteLink(leader, 'parent', 'Riley');

  // A campout that needs Parts A and B, with both Scouts on the roster.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event', { exact: true }).fill('Winter campout');
  await leader.getByRole('button', { name: 'Add event' }).click();
  await leader.getByRole('link', { name: 'Winter campout' }).click();
  await leader.getByLabel('Health form needed').selectOption('ab');
  await leader.getByLabel('Turn on sign-ups').check();
  await leader.getByRole('button', { name: 'Save settings' }).click();
  await expect(leader.getByText('Saved.')).toBeVisible();
  await expect(leader.getByText('Health form needed: Parts A and B')).toBeVisible();
  const roster = leader.getByRole('region', { name: 'Roster' });
  for (const name of ['Riley', 'Sam']) {
    await roster.getByLabel('Person to add').selectOption({ label: name });
    await roster.getByRole('button', { name: `Add ${name}` }).click();
    await expect(roster.getByText(name, { exact: false }).first()).toBeVisible();
  }
  const rileyRow = roster.getByRole('listitem').filter({ hasText: 'Riley' });
  const samRow = roster.getByRole('listitem').filter({ hasText: 'Sam' });
  await expect(rileyRow.getByText('Parts A and B missing')).toBeVisible();
  await expect(samRow.getByText('Parts A and B missing')).toBeVisible();

  // The parent records the date on a phone-sized screen.
  const parent = await signedIn(browser, 'health-parent@example.com', invite);
  await joinAsParent(parent, 'Jordan Parent');
  await parent.setViewportSize({ width: 375, height: 800 });
  await parent.getByRole('link', { name: 'Health forms', exact: true }).click();
  const card = parent.getByRole('region', { name: 'Health forms for Riley' });
  await expect(card.getByRole('heading', { name: /Parts A and B.*missing/ })).toBeVisible();
  await card.getByLabel('New date for Parts A and B').fill(yesterday());
  await card.getByRole('button', { name: 'Save Parts A and B date' }).click();
  await expect(card.getByText('Saved.')).toBeVisible();
  await expect(card.getByRole('heading', { name: /Parts A and B.*current/ })).toBeVisible();
  await expect(card.getByText(/Recorded by Jordan Parent/)).toBeVisible();
  expect(await parent.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true);
  // The other Scout is not the parent's to record.
  await expect(parent.getByRole('region', { name: 'Health forms for Sam' })).toBeHidden();

  // The leader's event roster now flags only Sam, and the filter shows only Sam.
  await leader.reload();
  const refreshed = leader.getByRole('region', { name: 'Roster' });
  await expect(refreshed.getByRole('listitem').filter({ hasText: 'Sam' }).getByText('Parts A and B missing')).toBeVisible();
  await expect(refreshed.getByRole('listitem').filter({ hasText: 'Riley' }).getByText('Parts A and B missing')).toBeHidden();
  await refreshed.getByLabel('Show only people missing a health form').check();
  await expect(refreshed.getByRole('listitem').filter({ hasText: 'Riley' })).toBeHidden();
  await expect(refreshed.getByRole('listitem').filter({ hasText: 'Sam' })).toBeVisible();
});
