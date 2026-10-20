import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('a leader adds a weekly meeting, cancels one date, and a parent sees it cancelled', async ({ browser }) => {
  const leader = await signedIn(browser, 'series-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 404');
  await leader.getByLabel('Unit number').fill('404');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 404' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  const invite = await createInviteLink(leader, 'parent', 'Riley');

  // A weekly meeting for four weeks, with times. The form previews the dates before saving.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event', { exact: true }).fill('Troop meeting');
  await leader.getByLabel('Date').fill(inDays(2));
  await leader.getByLabel('Starts (optional)').fill('19:00');
  await leader.getByLabel('Ends (optional)').fill('20:30');
  await leader.getByLabel('Repeats').selectOption('weekly');
  await leader.getByLabel('Until').fill(inDays(23));
  await expect(leader.getByText(/: 4 dates\./)).toBeVisible();
  await leader.getByRole('button', { name: 'Add dates' }).click();
  await expect(leader.getByText('Added 4 dates.')).toBeVisible();
  await expect(leader.getByRole('link', { name: 'Troop meeting' })).toHaveCount(4);

  // Open the soonest date (the list is newest first) and cancel it with a note.
  await leader.getByRole('link', { name: 'Troop meeting' }).last().click();
  await expect(leader.getByText(/Repeats: Every /)).toBeVisible();
  await expect(leader.getByText(/7:00 pm to 8:30 pm/)).toBeVisible();
  await leader.getByText('Change the date or place, or cancel').click();
  await leader.getByLabel("Why it's cancelled (optional)").fill('The church hall is closed.');
  await leader.getByRole('button', { name: 'Cancel this event' }).click();
  await leader.getByRole('button', { name: 'Yes, cancel and tell families' }).click();
  await expect(leader.getByText(/This event is cancelled\. The church hall is closed\./)).toBeVisible();

  // The parent sees the cancellation in the list and on the event, and can't sign up for it.
  const parent = await signedIn(browser, 'series-parent@example.com', invite);
  await joinAsParent(parent, 'Jordan Parent');
  await parent.getByRole('link', { name: 'Events', exact: true }).click();
  await expect(parent.getByText('Cancelled', { exact: true })).toHaveCount(1);
  await parent.getByRole('link', { name: 'Troop meeting' }).last().click();
  await expect(parent.getByText(/This event is cancelled/)).toBeVisible();
  await expect(parent.getByText('Change the date or place, or cancel')).toHaveCount(0);
});
