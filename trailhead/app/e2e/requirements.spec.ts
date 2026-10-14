import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('official requirement text shows up wherever requirements are mentioned', async ({ browser }) => {
  const leader = await signedIn(browser, 'req-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 404');
  await leader.getByLabel('Unit number').fill('404');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 404' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Riley', exact: true })).toBeVisible();

  // Badges page: text loads on demand, credited to Scouting America; a badge without data links out instead.
  await leader.getByRole('link', { name: 'Badges', exact: true }).click();
  await leader.getByLabel('Search badges').fill('camping');
  await leader.getByRole('button', { name: 'Show requirements' }).first().click();
  await expect(leader.getByText('Show that you know first aid for common camping injuries.')).toBeVisible();
  await expect(leader.getByRole('link', { name: 'Camping menu worksheet (video)' })).toHaveAttribute('target', '_blank');
  await expect(leader.getByText('Requirements © Scouting America.')).toBeVisible();
  await expect(leader.getByRole('link', { name: 'Source on scouting.org' })).toHaveAttribute('href', 'https://www.scouting.org/merit-badges/camping/');
  await leader.getByLabel('Search badges').fill('archery');
  await leader.getByRole('button', { name: 'Show requirements' }).first().click();
  await expect(leader.getByText('The requirement text is not available here yet.')).toBeVisible();
  await expect(leader.getByRole('link', { name: 'Official Archery requirements' })).toBeVisible();

  // Events: pick the covered requirement by its text; the event list shows it as a clickable number.
  await leader.getByRole('link', { name: 'Events' }).click();
  await leader.getByLabel('Event', { exact: true }).fill('Spring campout');
  await leader.getByLabel('Requirement covered (optional)').selectOption('camping');
  await expect(leader.getByText('Plan a menu for a campout.')).toBeVisible();
  await leader.getByRole('button', { name: 'Choose requirement 9a(1)' }).click();
  await expect(leader.getByText('Covers Camping requirement 9a(1).')).toBeVisible();
  await leader.getByRole('button', { name: 'Add event' }).click();
  const ref = leader.getByRole('button', { name: '9a(1)', exact: true });
  await expect(ref).toHaveAttribute('aria-expanded', 'false');
  await ref.click();
  await expect(ref).toHaveAttribute('aria-expanded', 'true');
  await expect(leader.getByRole('note')).toContainText('Make a shopping list.');
  await leader.keyboard.press('Escape');
  await expect(leader.getByRole('note')).toBeHidden();

  // Scout page: sign a rank requirement by picking it, then expand the checklist to see it marked signed.
  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByRole('link', { name: 'Riley', exact: true }).click();
  await leader.getByLabel('Rank or merit badge').first().selectOption('tenderfoot');
  await expect(leader.getByText('Demonstrate how to tie a square knot.')).toBeVisible();
  await leader.getByRole('button', { name: 'Choose requirement 1a' }).click();
  await leader.getByRole('button', { name: 'Sign off requirement' }).click();
  await expect(leader.getByText('Signed Tenderfoot requirement 1a.')).toBeVisible();
  await expect(leader.getByText(/Signed: 1a/)).toBeVisible();
  await leader.getByRole('button', { name: 'Show Tenderfoot requirements' }).click();
  // The sign-off form above also lists Tenderfoot, so both lists mark 1a as signed.
  await expect(leader.getByRole('list', { name: 'Tenderfoot requirements' })).toHaveCount(2);
  await expect(leader.getByText('Signed', { exact: true })).toHaveCount(2);
});
