import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

/** A Saturday about three weeks out, as YYYY-MM-DD. */
function saturdayAhead(): string {
  const d = new Date();
  d.setDate(d.getDate() + 21 + ((6 - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('the year at a glance shows booked and open weekends, and an open one starts a plan', async ({ browser }) => {
  const leader = await signedIn(browser, 'cal-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 606');
  await leader.getByLabel('Unit number').fill('606');
  await leader.getByLabel('Council').fill('Calendar Council');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 606' })).toBeVisible();

  // One campout on the calendar.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event', { exact: true }).fill('Fall campout');
  await leader.getByLabel('Date', { exact: true }).fill(saturdayAhead());
  await leader.getByRole('button', { name: 'Add event' }).click();
  await expect(leader.getByRole('link', { name: 'Fall campout' })).toBeVisible();

  // The year view as a list: the campout's weekend is booked, others are open.
  await leader.getByRole('link', { name: 'Year at a glance' }).click();
  await expect(leader.getByRole('heading', { name: 'Year at a glance' })).toBeVisible();
  await leader.getByRole('button', { name: 'List view' }).click();
  const list = leader.locator('.cal-list');
  await expect(list.getByText(/Fall campout/).first()).toBeVisible();
  await expect(list.getByText('Booked').first()).toBeVisible();
  await expect(list.getByText('Open').first()).toBeVisible();

  // An open weekend starts a plan with its dates already set.
  await list.getByRole('link', { name: 'Plan something this weekend' }).first().click();
  await expect(leader.getByText(/^For /)).toBeVisible();
  await leader.getByLabel('Name').fill('Weekend hike');
  await leader.getByRole('button', { name: 'Start the plan' }).click();
  await expect(leader.getByRole('heading', { name: 'Weekend hike' })).toBeVisible();
  await leader.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(leader.getByLabel('First day', { exact: true })).not.toHaveValue('');
});
