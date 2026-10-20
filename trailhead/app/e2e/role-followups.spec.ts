import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, join, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

const CHOICES = [
  { email: 'role-adv@example.com', pick: 'advancement', number: '811', roles: 'Leader and advancement chair' },
  { email: 'role-asst@example.com', pick: 'leader', number: '812', roles: 'Leader' },
  { email: 'role-chair@example.com', pick: 'committee_chair', number: '813', roles: 'Leader and committee member' },
];

for (const c of CHOICES) {
  test(`the troop creator can pick their role: ${c.pick}`, async ({ browser }) => {
    const creator = await signedIn(browser, c.email);
    await creator.getByRole('link', { name: 'Create a troop' }).click();
    await creator.getByLabel('Troop name').fill(`Troop ${c.number}`);
    await creator.getByLabel('Unit number').fill(c.number);
    await creator.getByLabel('Your name').fill('Pat Creator');
    await creator.getByLabel('Youth Protection training expires').fill(inOneYear());
    // Scoutmaster is the default. The hint changes with the choice.
    await expect(creator.getByLabel('Your role in the troop')).toHaveValue('scoutmaster');
    await creator.getByLabel('Your role in the troop').selectOption(c.pick);
    if (c.pick === 'committee_chair') {
      await expect(creator.getByText(/You also get the leader role, because only leaders can give out roles/)).toBeVisible();
    }
    await creator.getByRole('button', { name: 'Create troop' }).click();
    await expect(creator.getByRole('heading', { name: `Troop ${c.number}` })).toBeVisible();

    // Whatever they picked, they can still run the troop and give out roles.
    await creator.getByRole('link', { name: 'Roster', exact: true }).click();
    await expect(creator.getByText(new RegExp(`^· ${c.roles}$`))).toBeVisible(); // the roles after their name
    await expect(creator.getByLabel('Invite as')).toBeVisible();
  });
}

test('a leader records a paper permission slip for a Scout whose parents are not on Forthright', async ({ browser }) => {
  const leader = await signedIn(browser, 'slip-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 814');
  await leader.getByLabel('Unit number').fill('814');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 814' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Riley', exact: true })).toBeVisible();

  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event', { exact: true }).fill('Winter campout');
  await leader.getByRole('button', { name: 'Add event' }).click();
  await leader.getByRole('link', { name: 'Winter campout' }).click();
  await leader.getByLabel('Turn on sign-ups').check();
  await leader.getByLabel('A parent must give permission for each Scout').check();
  await leader.getByRole('button', { name: 'Save settings' }).click();
  await expect(leader.getByText('Saved.')).toBeVisible();

  const roster = leader.getByRole('region', { name: 'Roster' });
  await roster.getByLabel('Person to add').selectOption({ label: 'Riley' });
  await roster.getByRole('button', { name: 'Add Riley' }).click();
  await expect(roster.getByRole('heading', { name: 'Waiting for permission (1)' })).toBeVisible();

  await roster.getByRole('button', { name: 'Record paper slip for Riley' }).click();
  await expect(roster.getByRole('heading', { name: 'Going (1)' })).toBeVisible();
  await expect(roster.getByText(/Paper permission slip received \(recorded by Pat Leader/)).toBeVisible();
  await expect(roster.getByRole('button', { name: 'Record paper slip for Riley' })).toBeHidden();
});

test('an advancement chair can read, edit and delete any announcement', async ({ browser }) => {
  const leader = await signedIn(browser, 'chairpost-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 815');
  await leader.getByLabel('Unit number').fill('815');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 815' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  const chairInvite = await createInviteLink(leader, 'advancement');

  // The Scoutmaster posts to parents only. An advancement chair is not in that audience.
  await leader.getByRole('link', { name: 'Announcements', exact: true }).click();
  await leader.getByRole('button', { name: 'New announcement' }).click();
  await leader.getByLabel('Title').fill('Parents only note');
  await leader.getByLabel('Who is this for?').selectOption('parents');
  await leader.getByLabel('Message').fill('Please bring the form.');
  await leader.getByRole('button', { name: 'Post' }).click();
  await expect(leader.getByText('Posted.')).toBeVisible();

  // The chair joins afterwards and still reads it (later joiners catch up), and can edit and delete it.
  const chair = await signedIn(browser, 'chairpost-chair@example.com', chairInvite);
  await join(chair, 'Ada Chair', inOneYear());
  await chair.getByRole('link', { name: 'Announcements', exact: true }).click();
  await expect(chair.getByRole('heading', { name: 'Parents only note' })).toBeVisible({ timeout: 20_000 });
  await chair.getByRole('button', { name: 'Edit' }).click();
  await chair.getByLabel('Message').fill('Please bring the signed form.');
  await chair.getByRole('button', { name: 'Save changes' }).click();
  await expect(chair.getByText(/signed form/)).toBeVisible();
  await chair.getByRole('button', { name: 'Delete' }).click();
  await chair.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(chair.getByRole('heading', { name: 'Parents only note' })).toBeHidden();
});
