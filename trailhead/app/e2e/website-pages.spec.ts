import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

// Needs the storage emulator too, like website.spec.ts:
//   firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead "npm --prefix app run e2e"
const SLUG = 'troop-404-pages';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  await resetEmulators();
  await fetch('http://127.0.0.1:9199/internal/reset', { method: 'POST' });
});

test('a leader adds a page and a document, publishes, and a visitor sees them', async ({ browser }) => {
  const leader = await signedIn(browser, 'pages-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 404');
  await leader.getByLabel('Unit number').fill('404');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 404' })).toBeVisible();

  // A public event for the calendar page.
  await leader.getByRole('link', { name: 'Events' }).click();
  await leader.getByLabel('Event').fill('Winter campout');
  await leader.getByLabel('Date').fill(inDays(20));
  await leader.getByLabel('Place', { exact: true }).fill('Camp Lowden');
  await leader.getByLabel('Show on the troop website').check();
  await leader.getByRole('button', { name: 'Add event' }).click();
  await expect(leader.getByText(/Camp Lowden · On the troop website/)).toBeVisible();

  await leader.getByRole('link', { name: 'Website' }).click();
  await expect(leader.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
  await leader.getByLabel('Web address').fill(SLUG);
  await leader.getByLabel('About your troop').fill('We camp every month.');
  await leader.getByLabel('When you meet').fill('Mondays, 7:00 pm');
  await leader.getByLabel('Where you meet').fill("St. Mark's Hall");

  // Cover layout and announcement.
  await leader.getByRole('radio', { name: /Centered/ }).check();
  await leader.getByLabel('Announcement').fill('Camp fees are due October 30');

  // A custom page with a heading, a paragraph with a link and an unsafe link, and a list.
  await leader.getByRole('button', { name: 'Add a page' }).click();
  await leader.getByLabel('Page 1 title').fill('New families');
  await expect(leader.getByLabel('Page 1 web address')).toHaveValue('new-families');
  await leader.getByRole('button', { name: 'Add heading to page 1' }).click();
  await leader.getByLabel('Block 1 heading').fill('Welcome');
  await leader.getByRole('button', { name: 'Add paragraph to page 1' }).click();
  await leader
    .getByLabel('Block 2 paragraph')
    .fill('Read the [handbook](https://example.com/handbook) and [do not click](javascript:alert(1)).');
  await leader.getByRole('button', { name: 'Add bullet list to page 1' }).click();
  await leader.getByLabel('Block 3 bullet list').fill('Bring a water bottle\nWear closed shoes');

  // A public document and a leaders-only one.
  await leader.getByLabel('File', { exact: true }).setInputFiles({ name: 'gear-list.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(leader.getByLabel('Title', { exact: true })).toHaveValue('gear list');
  await leader.getByLabel('Title', { exact: true }).fill('Gear list');
  await leader.getByLabel('Category').selectOption('gear');
  await leader.getByLabel('Who can see it').selectOption('public');
  await leader.getByRole('button', { name: 'Add document' }).click();
  await expect(leader.getByText('Added "Gear list".')).toBeVisible();
  await leader.getByLabel('File', { exact: true }).setInputFiles({ name: 'medical.pdf', mimeType: 'application/pdf', buffer: PDF });
  await leader.getByLabel('Title', { exact: true }).fill('Health form');
  await leader.getByLabel('Category').selectOption('medical');
  await expect(leader.getByLabel('Who can see it').locator('option[value="public"]')).toHaveCount(0);
  await leader.getByRole('button', { name: 'Add document' }).click();
  await expect(leader.getByText('Added "Health form".')).toBeVisible();

  await leader.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(leader.getByText('Published. Your site is at')).toBeVisible();

  // A visitor with no account.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/s/${SLUG}`);
  await expect(visitor.getByText('Camp fees are due October 30')).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(visitor.getByRole('link', { name: /Gear list/ })).toBeVisible();
  await expect(visitor.getByText('Health form')).toHaveCount(0);
  const nav = visitor.getByRole('navigation', { name: 'Site menu' });
  await expect(nav.getByRole('link', { name: 'New families' })).toBeVisible();

  await nav.getByRole('link', { name: 'New families' }).click();
  await expect(visitor).toHaveURL(new RegExp(`/s/${SLUG}/new-families$`));
  await expect(visitor.getByRole('heading', { level: 1, name: 'New families' })).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(visitor.getByRole('link', { name: /handbook/ })).toHaveAttribute('href', 'https://example.com/handbook');
  await expect(visitor.getByText('do not click', { exact: false })).toBeVisible();
  await expect(visitor.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(visitor.getByRole('listitem').filter({ hasText: 'Wear closed shoes' })).toBeVisible();

  await nav.getByRole('link', { name: 'Calendar' }).click();
  await expect(visitor.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  await expect(visitor.getByText('Winter campout')).toBeVisible();
  await expect(visitor.getByText('Camp Lowden')).toBeVisible();

  await visitor.goto(`/s/${SLUG}/no-such-page`);
  await expect(visitor.getByText("We couldn't find that page")).toBeVisible();

  // Making the document leaders-only takes it off the live site; members see the Documents page in the app.
  await leader.getByRole('link', { name: 'Documents' }).click();
  await leader.getByRole('button', { name: 'Edit Gear list' }).click();
  await leader.getByLabel('Who can see Gear list').selectOption('leaders');
  await leader.getByRole('button', { name: 'Save changes' }).click();
  await expect(leader.locator('.pill', { hasText: 'Leaders only' })).toHaveCount(1);
  await visitor.goto(`/s/${SLUG}`);
  await expect(visitor.getByRole('link', { name: /Gear list/ })).toHaveCount(0, { timeout: 30_000 });

  // Unpublish takes the pages down too.
  await leader.getByRole('link', { name: 'Website' }).click();
  await leader.getByRole('button', { name: 'Unpublish' }).click();
  await expect(leader.getByText('Your site is unpublished.')).toBeVisible();
  await visitor.goto(`/s/${SLUG}/new-families`);
  await expect(visitor.getByText("We couldn't find that page")).toBeVisible();
});
