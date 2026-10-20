import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

// Run with the storage emulator too:
//   firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead "npm --prefix app run e2e"
const DOCS = 'http://127.0.0.1:8080/v1/projects/demo-trailhead/databases/(default)/documents';
const SLUG = 'troop-303-e2e';
// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

type Value = Record<string, unknown>;

/** Read a document as the emulator owner (bypassing rules). The public page itself isn't part of this test. */
async function readDoc(path: string): Promise<{ status: number; fields: Record<string, Value> }> {
  const res = await fetch(`${DOCS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  const body = res.ok ? await res.json() : {};
  return { status: res.status, fields: body.fields ?? {} };
}

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  await resetEmulators();
  await fetch('http://127.0.0.1:9199/internal/reset', { method: 'POST' });
});

test('a leader builds the troop website, uploads photos and publishes it', async ({ browser }) => {
  const leader = await signedIn(browser, 'website-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 303');
  await leader.getByLabel('Unit number').fill('303');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 303' })).toBeVisible();

  // A Scout whose family gave media consent on a paper form, recorded by the leader.
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByLabel('Current rank').selectOption('scout');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await leader.getByRole('link', { name: 'Sam', exact: true }).click();
  await expect(leader.getByText('Media consent not recorded')).toBeVisible();
  await leader.getByRole('button', { name: 'Allow photos', exact: true }).click();
  await expect(leader.getByText('Media consent given')).toBeVisible();

  // A public event for the site's calendar.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByLabel('Event').fill('Fall campout');
  await leader.getByLabel('Date').fill(inDays(14));
  await leader.getByLabel('Place', { exact: true }).fill('Camp Lowden');
  await leader.getByLabel('Show on the troop website').check();
  await leader.getByRole('button', { name: 'Add event' }).click();
  await expect(leader.getByText(/Camp Lowden · On the troop website/)).toBeVisible();

  await leader.getByRole('link', { name: 'Website' }).click();
  await expect(leader.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
  await leader.getByLabel('Web address').fill(SLUG);
  await expect(leader.getByText(`/s/${SLUG}`)).toBeVisible();
  await leader.getByLabel('Tagline').fill('Adventure starts here');
  await leader.getByRole('button', { name: 'Draft with AI' }).click();
  await leader.getByLabel('Notes for the AI').fill('We camp every month and do a service project each spring.');
  await leader.getByRole('button', { name: 'Write a draft' }).click();
  await expect(leader.getByLabel('About your troop')).toHaveValue(/Troop 303/);
  await leader.getByLabel('When you meet').fill('Mondays, 7:00–8:30 pm');
  await leader.getByLabel('Where you meet').fill("St. Mark's Hall");
  await leader.getByRole('button', { name: 'Add a question' }).click();
  await leader.getByLabel('Question 1').fill('What does it cost?');
  await leader.getByLabel('Answer 1').fill('$60 a year.');
  await leader.getByRole('button', { name: 'Add a contact' }).click();
  await leader.getByLabel('Contact 1', { exact: true }).selectOption({ label: 'Pat Leader' });
  await leader.getByLabel('Contact 1 role').fill('Scoutmaster');
  await leader.getByLabel('Contact 1 public email').fill('sm@example.com');

  // Photo 1 shows Sam (consent given); photo 2 is untagged, so it is left out.
  await leader.getByLabel('Add a photo').setInputFiles({ name: 'sam.png', mimeType: 'image/png', buffer: PNG });
  await expect(leader.getByLabel('Photo 1 caption')).toBeVisible();
  await leader.getByLabel('Photo 1 caption').fill('Sam at the lake');
  await leader.getByRole('checkbox', { name: 'Sam', exact: true }).check();
  await expect(leader.getByText('This photo will be published.')).toBeVisible();
  await leader.getByLabel('Add a photo').setInputFiles({ name: 'group.png', mimeType: 'image/png', buffer: PNG });
  await leader.getByLabel('Photo 2 caption').fill('Group hike');

  // The cover photo follows the same rule: untagged, it is left out and the site falls back to the troop color.
  await leader.getByLabel('Cover photo', { exact: true }).setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
  await expect(leader.getByText('This cover photo will be left out until every Scout in it has media consent')).toBeVisible();

  await leader.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(leader.getByText('Published. Your site is at')).toBeVisible();
  await expect(leader.getByText('2 images were left out')).toBeVisible();
  await expect(leader.getByText(/Group hike: Tag the Scouts in this photo/)).toBeVisible();
  await expect(leader.getByText(/Cover photo: Tag the Scouts in this cover photo/)).toBeVisible();
  await expect(leader.getByText(/The cover shows your troop color instead/)).toBeVisible();

  // Confirming that no Scouts can be identified lets the cover photo publish on the next publish.
  await leader.getByRole('checkbox', { name: 'No Scouts can be identified in the cover photo' }).check();
  await expect(leader.getByText('This cover photo will be published.')).toBeVisible();
  await leader.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(leader.getByText('1 image was left out')).toBeVisible();

  const site = await readDoc(`publicSites/${SLUG}`);
  expect(site.status).toBe(200);
  expect(site.fields.troopName).toEqual({ stringValue: 'Troop 303' });
  const gallery = (site.fields.gallery as { arrayValue: { values: { mapValue: { fields: Record<string, Value> } }[] } })
    .arrayValue.values;
  expect(gallery).toHaveLength(1);
  expect(gallery[0].mapValue.fields.caption).toEqual({ stringValue: 'Sam at the lake' });
  const photoUrl = gallery[0].mapValue.fields.url.stringValue as string;
  expect((await fetch(photoUrl)).status).toBe(200);
  const coverUrl = (site.fields.cover as { mapValue: { fields: Record<string, Value> } }).mapValue.fields.photoUrl
    .stringValue as string;
  expect((await fetch(coverUrl)).status).toBe(200);
  expect(JSON.stringify(site.fields)).toContain('Fall campout');
  expect(JSON.stringify(site.fields)).not.toContain('"Sam"');

  await expect(leader.getByText('Live now at')).toBeVisible();
  await leader.getByRole('button', { name: 'Unpublish' }).click();
  await expect(leader.getByText('Your site is unpublished.')).toBeVisible();
  expect((await readDoc(`publicSites/${SLUG}`)).status).toBe(404);
});
