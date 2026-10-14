import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

const SLUG = 'troop-303';

/** Write a published site the way the server would, using the emulator's owner token. */
async function seedSite(troopId: string, open: boolean): Promise<void> {
  const str = (stringValue: string) => ({ stringValue });
  const site = {
    slug: str(SLUG),
    troopId: str(troopId),
    troopName: str('Troop 303'),
    unitNumber: str('303'),
    council: str('Pine Council'),
    theme: { mapValue: { fields: { color: str('#2f5d8a'), logoUrl: { nullValue: null } } } },
    cover: { mapValue: { fields: { heading: str('Adventure starts here'), tagline: str('Camping, canoes and friends'), photoUrl: { nullValue: null } } } },
    about: str('We are a friendly troop.\n\nWe camp every month.'),
    meeting: { mapValue: { fields: { schedule: str('Mondays at 7pm'), place: str('Scout Hall'), address: { nullValue: null }, mapUrl: str('https://maps.example.com/hall') } } },
    faq: { arrayValue: { values: [{ mapValue: { fields: { q: str('What does it cost?'), a: str('Dues are low.') } } }] } },
    contacts: { arrayValue: { values: [{ mapValue: { fields: { name: str('Pat Leader'), role: str('Scoutmaster'), email: str('pat@example.com') } } }] } },
    gallery: { arrayValue: { values: [] } },
    events: { arrayValue: { values: [{ mapValue: { fields: { title: str('Spring campout'), start: str('2099-04-10'), place: { nullValue: null } } } }] } },
    recruiting: { mapValue: { fields: { open: { booleanValue: open }, intro: str('We would love to meet you.') } } },
  };
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-trailhead/databases/(default)/documents/publicSites/${SLUG}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: site }),
  });
  expect(res.ok).toBe(true);
}

test.beforeAll(resetEmulators);

test('a family finds the troop website, asks to join, and a leader invites them', async ({ browser }) => {
  const leader = await signedIn(browser, 'leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 303');
  await leader.getByLabel('Unit number').fill('303');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 303' })).toBeVisible();
  const troopId = new URL(leader.url()).pathname.split('/')[2];
  await seedSite(troopId, true);

  // A visitor who is signed out sees a troop website, not the app.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/s/${SLUG}`);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Adventure starts here' })).toBeVisible();
  await expect(visitor).toHaveTitle(/Troop 303/);
  await expect(visitor.getByText('Mondays at 7pm')).toBeVisible();
  await expect(visitor.getByRole('link', { name: /Open in maps/ })).toBeVisible();
  await expect(visitor.getByText('Spring campout')).toBeVisible();
  await expect(visitor.getByText('pat@example.com')).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await expect(visitor.getByText('Made with')).toBeVisible();

  await visitor.getByLabel('Parent or guardian name').fill('Jordan Lee');
  await visitor.getByLabel('Email', { exact: true }).fill('jordan@example.com');
  await visitor.getByLabel("Scout's age or grade").fill('11');
  await visitor.getByLabel(/Anything you'd like/).fill('Our son loves camping.');
  await visitor.getByRole('button', { name: 'Tell me more' }).click();
  await expect(visitor.getByRole('status')).toContainText('Thank you');

  // The leader is told, opens Recruiting, and makes an invite link.
  await leader.goto(`/t/${troopId}`);
  await expect(leader.getByRole('link', { name: /1 family wants to hear about the troop/ })).toBeVisible();
  await leader.getByRole('link', { name: 'Recruiting (1)' }).click();
  await expect(leader.getByRole('heading', { name: 'Jordan Lee' })).toBeVisible();
  await expect(leader.getByText('Our son loves camping.')).toBeVisible();
  await leader.getByRole('button', { name: 'Create invite link' }).click();
  await expect(leader.getByLabel('Invite link')).toHaveValue(/\/join\//);
  await expect(leader.getByLabel('Status')).toHaveValue('invited');
  await expect(leader.getByRole('link', { name: 'Recruiting', exact: true })).toBeVisible();
});

test('a closed troop page shows no Join us form, and unknown pages say so', async ({ browser }) => {
  const leader = await signedIn(browser, 'closed-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 303');
  await leader.getByLabel('Unit number').fill('303');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 303' })).toBeVisible();
  await seedSite(new URL(leader.url()).pathname.split('/')[2], false);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/s/${SLUG}`);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Adventure starts here' })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Tell me more' })).toHaveCount(0);

  await visitor.goto('/s/nobody-here');
  await expect(visitor.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible();
});
