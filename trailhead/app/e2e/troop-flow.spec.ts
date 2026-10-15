import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, join, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader, a parent and a counselor take a Scout through a merit badge', async ({ browser }) => {
  // Leader creates the troop and adds a Scout.
  const leader = await signedIn(browser, 'leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 101');
  await leader.getByLabel('Unit number').fill('101');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 101' })).toBeVisible();

  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByLabel('Current rank').selectOption('first-class');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();
  const parentInvite = await createInviteLink(leader, 'parent', 'Sam');
  const counselorInvite = await createInviteLink(leader, 'counselor');

  // Parent joins from the invite link, plans a path and starts a blue card.
  const parent = await signedIn(browser, 'parent@example.com', parentInvite);
  await joinAsParent(parent, 'Jordan Parent');
  await parent.getByRole('link', { name: /Sam/ }).click();
  await parent.getByRole('link', { name: 'Plan a path' }).click();
  await parent.getByLabel('Goal').selectOption('star');
  await parent.getByLabel('Add a merit badge').selectOption('chess');
  await expect(parent.getByText("Won't work as planned")).toBeVisible();
  await expect(parent.getByText(/Star needs 6 merit badges/)).toBeVisible();
  // The AI draft (the emulator uses the fake planner) shows a checked preview; discarding leaves the plan alone.
  await parent.getByRole('button', { name: 'Draft with AI' }).click();
  await parent.getByLabel('What do you want to work toward?').fill('Get me to Star by spring');
  await parent.getByRole('button', { name: 'Draft a plan' }).click();
  await expect(parent.getByRole('heading', { name: 'Your draft' })).toBeVisible();
  await expect(parent.getByText(/Practice plan/)).toBeVisible();
  await parent.getByRole('button', { name: 'Discard' }).click();
  await expect(parent.getByRole('heading', { name: 'Your draft' })).toBeHidden();
  await parent.getByRole('button', { name: 'Save plan' }).click();
  await expect(parent.getByRole('heading', { name: 'Path to Star' })).toBeVisible();
  await expect(parent.getByText("Won't work as planned")).toBeVisible();

  await parent.getByRole('link', { name: 'Badges' }).click();
  await parent.getByLabel('Search badges').fill('chess');
  await parent.getByRole('button', { name: 'Start a blue card' }).click();
  await expect(parent.getByText('Blue card requested')).toBeVisible();

  // Counselor joins. Leader approves the blue card and assigns them.
  const counselor = await signedIn(browser, 'mbc@example.com', counselorInvite);
  await join(counselor, 'Casey Counselor', inOneYear());
  await expect(counselor.getByRole('link', { name: 'Counseling' })).toBeVisible();

  await leader.getByRole('link', { name: 'Blue cards' }).click();
  await leader.getByRole('button', { name: 'Approve' }).click();
  await leader.getByLabel('Counselor').selectOption({ label: 'Casey Counselor' });
  await leader.getByRole('button', { name: 'Assign' }).click();
  await expect(leader.getByText('Counselor: Casey Counselor')).toBeVisible();

  // Counselor signs a requirement and completes the badge.
  await counselor.getByRole('link', { name: 'Counseling' }).click();
  await counselor.getByRole('button', { name: 'Start working with this Scout' }).click();
  // The counselor reads the badge's requirements right on the page and signs one with its button.
  await expect(counselor.getByText('Discuss the history of the game of chess.')).toBeVisible();
  await counselor.getByRole('button', { name: 'Sign requirement 1a' }).click();
  await expect(counselor.getByText('Signed so far: 1a')).toBeVisible();
  await expect(counselor.getByRole('button', { name: 'Sign requirement 1a' })).toBeHidden();
  await expect(counselor.getByText('Requirements © Scouting America')).toBeVisible();
  await counselor.getByRole('button', { name: 'Mark Chess complete' }).click();
  await expect(counselor.getByRole('heading', { name: 'Completed' })).toBeVisible();

  // Everyone sees the result on Sam's page.
  await parent.getByRole('link', { name: 'Home' }).click();
  await parent.getByRole('link', { name: /Sam/ }).click();
  await expect(parent.getByText(/^Complete /)).toBeVisible();

  // Leader messages Sam; Sam has no login, so the parent is added automatically and replies.
  await leader.getByRole('link', { name: 'Messages' }).click();
  await expect(leader.getByText(/Scouts can message adult leaders, not other Scouts/)).toBeVisible();
  await leader.getByRole('button', { name: 'New message' }).click();
  await leader.getByRole('checkbox', { name: 'Sam' }).check();
  await leader.getByLabel('Message').fill('Great work on Chess!');
  await leader.getByRole('button', { name: 'Send' }).click();
  await expect(leader.getByRole('heading', { name: /Jordan Parent/ })).toBeVisible();

  await parent.getByRole('link', { name: 'Messages' }).click();
  await parent.getByRole('link', { name: /Great work on Chess/ }).click();
  await parent.getByLabel('Reply').fill('Thank you!');
  await parent.getByRole('button', { name: 'Reply' }).click();
  await expect(leader.getByText('Thank you!')).toBeVisible();

  // Leader takes attendance at a campout; Sam's camping nights are logged.
  await leader.getByRole('link', { name: 'Events' }).click();
  await leader.getByLabel('Event').fill('October campout');
  await leader.getByLabel('Nights camped').fill('2');
  await leader.getByRole('button', { name: 'Add event' }).click();
  await leader.getByRole('link', { name: 'Attendance' }).click();
  await leader.getByRole('checkbox', { name: 'Sam' }).check();
  await expect(leader.getByText('1 of 1 Scouts present')).toBeVisible();
});
