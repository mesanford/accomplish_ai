import { expect, type Page, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

async function startTroop(leader: Page): Promise<void> {
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 404');
  await leader.getByLabel('Unit number').fill('404');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 404' })).toBeVisible();
}

async function addScout(leader: Page, name: string): Promise<void> {
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill(name);
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name, exact: true })).toBeVisible();
}

test('a leader sets a campout with 2 nights, marks attendance and sees the Scout totals', async ({
  browser,
}) => {
  const leader = await signedIn(browser, 'activity-leader@example.com');
  await startTroop(leader);
  await addScout(leader, 'Riley');

  // The event, with its activity log: a campout of 2 nights.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event', { exact: true }).fill('October campout');
  await leader.getByRole('button', { name: 'Add event' }).click();
  await leader.getByRole('link', { name: 'October campout' }).click();
  await leader.getByText('Activity log: nights, service hours and miles').click();
  await leader.getByLabel('Kind of activity').selectOption('campout');
  await leader.getByLabel('Nights camped').fill('2');
  await leader.getByRole('button', { name: 'Save activity log' }).click();
  await expect(leader.getByText(/Saved\. Scouts marked present get these credits\./)).toBeVisible();

  // Attendance: tick Riley.
  await leader.getByRole('link', { name: 'Attendance' }).click();
  await leader.getByLabel('Riley').check();

  // The Scout's page shows the totals once the server has added the credit.
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByRole('link', { name: 'Riley', exact: true }).click();
  const totals = leader.getByTestId('activity-totals');
  await expect(totals).toContainText('2 nights camped in 1 campout');
  await expect(leader.getByText('Camping merit badge: 2 of 20 nights count.')).toBeVisible();
  await expect(leader.getByText('October campout')).toBeVisible();

  // A manual entry by a leader counts at once.
  await leader.getByText('Add an entry', { exact: true }).click();
  await leader.getByLabel('Service hours').fill('3');
  await leader.getByLabel('Note').fill('Park cleanup');
  await leader.getByRole('button', { name: 'Add entry', exact: true }).click();
  await expect(totals).toContainText('3 service hours');

  // The page works at phone width.
  await leader.setViewportSize({ width: 375, height: 800 });
  await expect(totals).toBeVisible();
  expect(await leader.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true);

  // Unticking Riley takes the nights away again.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByRole('link', { name: 'Attendance' }).click();
  await leader.getByLabel('Riley').uncheck();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByRole('link', { name: 'Riley', exact: true }).click();
  await expect(totals).toContainText('0 nights camped');
});

test('a leader makes a patrol, adds a Scout, filters the roster and sees the troop report', async ({
  browser,
}) => {
  const leader = await signedIn(browser, 'patrol-leader@example.com');
  await startTroop(leader);
  await addScout(leader, 'Riley');
  await addScout(leader, 'Jules');

  await leader.getByRole('link', { name: 'Patrols', exact: true }).click();
  await leader.getByLabel('Patrol name').fill('Eagles');
  await leader.getByRole('button', { name: 'Add patrol' }).click();
  const card = leader.getByRole('region', { name: 'Eagles patrol' });
  await expect(card).toBeVisible();
  await card.getByLabel('Add a Scout').selectOption({ label: 'Riley' });
  await card.getByRole('button', { name: 'Add to Eagles' }).click();
  await expect(card.getByText('1 Scout: Riley')).toBeVisible();
  await card.getByLabel('Patrol leader', { exact: true }).selectOption({ label: 'Riley' });
  await card.getByRole('button', { name: 'Save Eagles' }).click();
  await expect(card.getByText('Saved.')).toBeVisible();

  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel('Show').selectOption({ label: 'Eagles' });
  await expect(leader.getByRole('link', { name: 'Riley', exact: true })).toBeVisible();
  await expect(leader.getByRole('link', { name: 'Jules', exact: true })).toBeHidden();

  await leader.getByRole('link', { name: 'Activity report' }).click();
  await expect(leader.getByRole('heading', { name: /Service hours in/ })).toBeVisible();
  await expect(
    leader.getByRole('table', { name: 'Totals by patrol' }).getByText('Eagles'),
  ).toBeVisible();
  await expect(
    leader.getByRole('table', { name: 'Totals by Scout' }).getByText('Troop total'),
  ).toBeVisible();
});
