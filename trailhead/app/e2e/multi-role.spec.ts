import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, join, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a leader adds their own child and is both leader and parent', async ({ browser }) => {
  const leader = await signedIn(browser, 'multi-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 303');
  await leader.getByLabel('Unit number').fill('303');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 303' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster' }).click();

  // A Scout who may be under 13 asks the leader to confirm the family's permission. "This is my child" swaps that
  // for the parent notice and the parent's own agreement.
  const confirm = leader.getByRole('checkbox', { name: /parent or guardian has given the troop permission/ });
  const agree = leader.getByRole('checkbox', { name: "I am this Scout's parent or guardian, and I agree." });
  await leader.getByLabel("Scout's name").fill('Ava');
  await leader.getByLabel('Birth month').selectOption('1');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 11));
  await expect(confirm).toBeVisible();
  await expect(agree).toBeHidden();
  await leader.getByRole('checkbox', { name: 'This is my child' }).check();
  await expect(confirm).toBeHidden();
  await expect(leader.getByRole('heading', { name: 'Notice to parents and guardians' })).toBeVisible();
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByText('Tick the box to agree before adding your Scout.')).toBeVisible();
  await agree.check();
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Ava', exact: true })).toBeVisible();

  // The roster shows both roles and the parent consent the leader just gave.
  await expect(leader.getByText('Leader and parent')).toBeVisible();
  await expect(leader.getByText('Parent of Ava')).toBeVisible();
  await expect(leader.getByText(/Parent consent: given/)).toBeVisible();

  // Home and the Scout's page show Ava as their child.
  await leader.getByRole('link', { name: 'Home' }).click();
  await expect(leader.getByText(/Your child · View path/)).toBeVisible();
  await leader.getByRole('link', { name: /Ava/ }).click();
  await expect(leader.getByRole('heading', { name: 'Ava' })).toBeVisible();
  await expect(leader.getByText('Your child', { exact: true })).toBeVisible();
  await expect(leader.getByRole('button', { name: "I'm this Scout's parent" })).toBeHidden();
});

test('a leader gives a committee member the parent role and they agree to the notice themselves', async ({ browser }) => {
  const leader = await signedIn(browser, 'gate-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 304');
  await leader.getByLabel('Unit number').fill('304');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 304' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Sam', exact: true })).toBeVisible();
  const invite = await createInviteLink(leader, 'committee');

  const member = await signedIn(browser, 'gate-member@example.com', invite);
  await join(member, 'Casey Committee', inOneYear());
  await expect(member.getByRole('heading', { name: 'Troop 304' })).toBeVisible();

  await leader.getByRole('button', { name: 'Change roles for Casey Committee' }).click();
  const form = leader.getByRole('form', { name: 'Roles for Casey Committee' });
  await form.getByRole('checkbox', { name: 'Parent or guardian' }).check();
  await form.getByRole('button', { name: 'Save roles' }).click();
  await expect(leader.getByText('Choose which Scouts this person is a parent of.')).toBeVisible();
  await form.getByRole('checkbox', { name: 'Sam' }).check();
  await form.getByRole('button', { name: 'Save roles' }).click();
  await expect(leader.getByText(/Casey Committee will be asked to agree to the parent notice/)).toBeVisible();
  await expect(leader.getByText('Has not agreed to the parent notice')).toBeVisible();
  await expect(leader.getByText('Waiting for a parent to agree')).toBeVisible();

  // The new parent must agree before the troop opens again. Nothing is recorded for them until they do.
  await expect(member.getByRole('heading', { name: 'Agree to the parent notice' })).toBeVisible();
  await expect(member.getByRole('link', { name: 'Events' })).toBeVisible();
  await member.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(member.getByText('Tick the box to agree, or choose not to agree.')).toBeVisible();
  await member.getByRole('checkbox', { name: /I am the parent or guardian of Sam, and I agree/ }).check();
  await member.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(member.getByRole('heading', { name: 'Agree to the parent notice' })).toBeHidden();
  await expect(member.getByText(/Your child · View path/)).toBeVisible();
  await expect(leader.getByText(/Parent consent: given/)).toBeVisible();
  await expect(leader.getByText('Has not agreed to the parent notice')).toBeHidden();
});
