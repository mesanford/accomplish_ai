import { expect, type Page, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

async function addEvent(leader: Page, title: string): Promise<void> {
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event', { exact: true }).fill(title);
  await leader.getByRole('button', { name: 'Add event' }).click();
  await leader.getByRole('link', { name: title }).click();
  await expect(leader.getByRole('heading', { name: title })).toBeVisible();
}

async function turnOnSignups(leader: Page, fee: string, question?: string): Promise<void> {
  await leader.getByLabel('Turn on sign-ups').check();
  if (question) {
    await leader.getByRole('button', { name: 'Add a question' }).click();
    await leader.getByLabel('Question 1', { exact: true }).fill(question);
  }
  await leader.getByLabel('Number of spots').fill('5');
  await leader.getByLabel('A parent must give permission for each Scout').check();
  await leader.getByLabel('Fee per Scout, in dollars').fill(fee);
  await leader.getByRole('button', { name: 'Save settings' }).click();
  await expect(leader.getByText('Saved.')).toBeVisible();
}

test('a parent signs up a Scout and approves permission; a leader sees the roster and notes', async ({
  browser,
}) => {
  const leader = await signedIn(browser, 'events-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 303');
  await leader.getByLabel('Unit number').fill('303');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 303' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Riley', exact: true })).toBeVisible();
  const invite = await createInviteLink(leader, 'parent', 'Riley');

  // A campout with sign-ups, a question, a fee and a permission slip.
  await addEvent(leader, 'October campout');
  await turnOnSignups(leader, '25', 'Dietary needs');
  await expect(leader.getByText('Fee: $25 per Scout').first()).toBeVisible();
  await expect(leader.getByText('0 of 5 spots filled')).toBeVisible();

  // The parent joins, finds the event on a phone-sized screen and signs Riley up.
  const parent = await signedIn(browser, 'events-parent@example.com', invite);
  await joinAsParent(parent, 'Jordan Parent');
  await parent.setViewportSize({ width: 375, height: 800 });
  await parent.getByRole('link', { name: 'Events', exact: true }).click();
  await parent.getByRole('link', { name: 'October campout' }).click();
  const card = parent.getByRole('region', { name: 'Sign-up for Riley' });
  await card.getByLabel('Dietary needs (optional)').fill('Vegetarian');
  await card
    .getByLabel('Health or emergency note (optional)')
    .fill('Asthma, inhaler in the blue bag');
  await card.getByRole('button', { name: 'Sign up Riley' }).click();
  await expect(
    parent.getByText('Tick the box to give permission for your Scout to go.'),
  ).toBeVisible();
  await card.getByRole('checkbox', { name: /I give permission for Riley/ }).check();
  await card.getByRole('button', { name: 'Sign up Riley' }).click();
  await expect(card.getByText('Going', { exact: true })).toBeVisible();
  await expect(card.getByText(/Permission given by Jordan Parent/)).toBeVisible();
  expect(await parent.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true);
  await expect(parent.getByText(/Asthma, inhaler/)).toBeHidden(); // the family can't read the note back

  // The leader sees who is going, the answer and the note.
  await leader.reload();
  const roster = leader.getByRole('region', { name: 'Roster' });
  await expect(roster.getByRole('heading', { name: 'Going (1)' })).toBeVisible();
  await expect(roster.getByText('Dietary needs: Vegetarian')).toBeVisible();
  await expect(
    roster.getByText('Health or emergency note: Asthma, inhaler in the blue bag'),
  ).toBeVisible();
  // Charging the fee is the treasurer's job (covered in the integration tests); the leader is told so.
  await expect(leader.getByText('The treasurer charges this fee to Scout accounts.')).toBeVisible();
  await expect(leader.getByRole('button', { name: 'Charge going Scouts' })).toBeHidden();

  // A leader adds Riley to a second event; Riley waits until the parent gives permission.
  await addEvent(leader, 'November hike');
  await turnOnSignups(leader, '');
  const rosterTwo = leader.getByRole('region', { name: 'Roster' });
  await rosterTwo.getByLabel('Person to add').selectOption({ label: 'Riley' });
  await rosterTwo.getByRole('button', { name: 'Add Riley' }).click();
  await expect(
    rosterTwo.getByRole('heading', { name: 'Waiting for permission (1)' }),
  ).toBeVisible();

  await parent.getByRole('link', { name: 'Events', exact: true }).click();
  await parent.getByRole('link', { name: 'November hike' }).click();
  const slip = parent.getByRole('region', { name: 'Sign-up for Riley' });
  await expect(slip.getByText('Waiting for permission')).toBeVisible();
  await slip.getByRole('button', { name: 'Give permission for Riley' }).click();
  await expect(slip.getByText('Permission recorded.')).toBeVisible();
  await expect(slip.getByText('Going', { exact: true })).toBeVisible();

  // The calendar link: a private address, and a webcal link for calendar apps.
  await parent.getByRole('link', { name: 'Events', exact: true }).click();
  await parent.getByRole('button', { name: 'Add to your calendar' }).click();
  await expect(parent.getByLabel('Calendar address')).toHaveValue(/\/cal\/[A-Za-z0-9_-]{43}\.ics$/);
  await expect(parent.getByRole('link', { name: 'Open in calendar app' })).toHaveAttribute(
    'href',
    /^webcal:\/\//,
  );
});
