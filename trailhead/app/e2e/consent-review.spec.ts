import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

const DOCS = 'http://127.0.0.1:8080/v1/projects/demo-trailhead/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };

/** Make every parent consent in the troop look like it was given for an older notice (the emulator bypasses rules). */
async function ageConsents(troopId: string, version: string): Promise<void> {
  const list = await (await fetch(`${DOCS}/troops/${troopId}/consents`, { headers: OWNER })).json();
  for (const document of list.documents ?? []) {
    const entries = document.fields.parentConsents.arrayValue.values;
    for (const entry of entries) {
      entry.mapValue.fields.version = { stringValue: version };
    }
    const url = `${DOCS}/${document.name.split('/documents/')[1]}?updateMask.fieldPaths=parentConsents`;
    const body = JSON.stringify({ fields: { parentConsents: { arrayValue: { values: entries } } } });
    const res = await fetch(url, { method: 'PATCH', headers: { ...OWNER, 'Content-Type': 'application/json' }, body });
    expect(res.ok).toBe(true);
  }
}

test('a parent who agreed to an older notice sees what changed and agrees; leaders see and remind them', async ({ browser }) => {
  const leader = await signedIn(browser, 'review-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 303');
  await leader.getByLabel('Unit number').fill('303');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 303' })).toBeVisible();
  const troopId = leader.url().split('/t/')[1].split('/')[0];
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth month').selectOption('1');
  await leader.getByLabel('Birth year').fill('2010');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Riley', exact: true })).toBeVisible();

  const invite = await createInviteLink(leader, 'parent', 'Riley');
  const parent = await signedIn(browser, 'review-parent@example.com', invite);
  await joinAsParent(parent, 'Jordan Parent');
  await expect(parent.getByRole('heading', { name: 'Troop 303' })).toBeVisible();
  await expect(parent.getByLabel('The parent notice changed')).toBeHidden(); // agreed to the current notice

  // The notice changes: this parent's consent is now for an older version.
  await ageConsents(troopId, '2026-10-15.3');

  // The leader sees who has not reviewed it, and can send a reminder (once a week per parent).
  await leader.goto(`/t/${troopId}`);
  await expect(leader.getByText("1 Scout has a parent who hasn't reviewed the new notice")).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  // That older notice came before kinds of data added since, so the Scout's row says those are paused.
  await expect(leader.getByText('Waiting for a parent to agree to the updated notice.', { exact: true })).toBeVisible();
  await leader.getByRole('button', { name: 'Send a reminder to these parents' }).click();
  await expect(leader.getByText('Sent 1 reminder.')).toBeVisible();
  await leader.getByRole('button', { name: 'Send a reminder to these parents' }).click();
  await expect(leader.getByText(/No reminders were sent\. 1 already got one in the last 7 days, or all four\./)).toBeVisible();

  // The parent sees a card, not a blocking page: the rest of the app still works.
  await parent.goto(`/t/${troopId}`);
  const card = parent.getByLabel('The parent notice changed');
  await expect(card.getByRole('heading', { name: 'The notice for Riley changed' })).toBeVisible();
  await expect(card.getByText('Patrols: we keep which patrol your Scout is in.')).toBeVisible();
  await expect(card.getByText(/Health notes: you can add a health or emergency note/)).toBeVisible();
  await expect(card.getByLabel('Notice to parents and guardians')).toBeVisible();
  await expect(parent.getByRole('link', { name: /Riley/ })).toBeVisible();

  // Not agreeing explains what happens and withdraws nothing.
  await card.getByRole('button', { name: "I don't agree" }).click();
  await expect(card.getByText(/nothing is deleted and nothing changes yet/)).toBeVisible();
  await expect(card.getByRole('link', { name: /withdraw consent/ })).toBeVisible();
  await leader.reload();
  await expect(leader.getByText(/A parent withdrew consent/)).toBeHidden();
  await card.getByRole('button', { name: 'Go back' }).click();

  // Agreeing records a new consent and clears the card, and the leader's warning.
  await card.getByRole('button', { name: 'I agree' }).click();
  await expect(parent.getByLabel('The parent notice changed')).toBeHidden();
  await expect(leader.getByText('Waiting for a parent to agree to the updated notice.', { exact: true })).toBeHidden();
});
