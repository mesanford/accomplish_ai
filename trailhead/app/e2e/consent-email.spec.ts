import { expect, test } from '@playwright/test';
import { addYoungScout, consentLinkFor, createTroopAsLeader, outbox } from './consentEmail';
import { joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

const MOM = { name: 'Jordan Parent', email: 'email-mom@example.com' };
const DAD = { name: 'Chris Parent', email: 'email-dad@example.com' };

test('a leader adds an under-12 Scout with two parents; one agrees from the email link and the other stops being asked', async ({
  browser,
}) => {
  const leader = await signedIn(browser, 'email-leader@example.com');
  await createTroopAsLeader(leader, 'Troop 404', '404');
  await addYoungScout(leader, 'Riley', [MOM, DAD]);

  // Until a parent agrees, the Scout is only a name and a waiting status; no leader confirmation is offered.
  await expect(leader.getByRole('link', { name: 'Riley', exact: true })).toBeVisible();
  await expect(leader.getByText('Waiting for parent consent')).toBeVisible();
  await expect(leader.getByText('Leader confirmed permission')).toBeHidden();
  const parents = leader.getByLabel('Parents of Riley');
  await expect(parents.getByText('Jordan Parent')).toBeVisible();
  await expect(parents.getByText('Chris Parent')).toBeVisible();
  await expect(parents.getByText('Emailed')).toHaveCount(2);

  // Each parent was emailed their own link, directly.
  const momLink = await consentLinkFor(MOM.email);
  const dadLink = await consentLinkFor(DAD.email);
  expect(momLink).not.toBe(dadLink);

  // The link only works for the address it was sent to; Mom signs in with hers and agrees.
  const wrong = await signedIn(browser, 'email-stranger@example.com', momLink);
  await wrong.getByLabel('Your name').fill('Not Mom');
  await wrong.getByRole('checkbox', { name: "I am this Scout's parent or guardian, and I agree." }).check();
  await wrong.getByRole('button', { name: 'Join troop' }).click();
  await expect(wrong.getByText(/sent to a different email address/)).toBeVisible();

  const mom = await signedIn(browser, MOM.email, momLink);
  await expect(mom.getByText(/asked you to review the notice for Riley/)).toBeVisible();
  await joinAsParent(mom, 'Jordan Parent');
  await expect(mom.getByRole('link', { name: /Riley/ })).toBeVisible();

  // The Scout now has consent. The leader sees who answered, and the other parent is "No answer": no more reminders.
  await leader.reload();
  await leader.getByRole('link', { name: 'Riley', exact: true }).click();
  const emailed = leader.getByLabel('Parents emailed');
  await expect(emailed.getByText('Agreed')).toBeVisible();
  await expect(emailed.getByText('No answer')).toBeVisible();
  const sent = (await outbox('consent_request')).length;
  expect(sent).toBe(2); // one email each; nobody is emailed again
  expect(await outbox('consent_confirmation')).toHaveLength(1); // Mom's record of what she agreed to

  // Dad can still sign in with his link and link himself as a parent later.
  const dad = await signedIn(browser, DAD.email, dadLink);
  await joinAsParent(dad, 'Chris Parent');
  await expect(dad.getByRole('link', { name: /Riley/ })).toBeVisible();
});

test('a parent can decline from the email link and is not linked; the Scout keeps waiting for the other parent', async ({ browser }) => {
  const leader = await signedIn(browser, 'decline-leader@example.com');
  await createTroopAsLeader(leader, 'Troop 405', '405');
  const mom = { name: 'Alex Parent', email: 'decline-mom@example.com' };
  const dad = { name: 'Sam Parent', email: 'decline-dad@example.com' };
  await addYoungScout(leader, 'Kai', [mom, dad]);

  const dadPage = await signedIn(browser, dad.email, await consentLinkFor(dad.email));
  await dadPage.getByRole('button', { name: "I don't agree" }).click();
  await expect(dadPage.getByRole('heading', { name: 'Thank you for answering' })).toBeVisible();

  await leader.reload();
  await expect(leader.getByText('Waiting for parent consent')).toBeVisible();
  await expect(leader.getByLabel('Parents of Kai').getByText('Declined')).toBeVisible();
  await expect(leader.getByLabel('Parents of Kai').getByText('Emailed')).toBeVisible();
});
