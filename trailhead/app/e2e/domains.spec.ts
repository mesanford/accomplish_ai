import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

// Runs against the emulators, where the Functions emulator never calls the live Hosting API (its fake answers by
// the domain's name), like website.spec.ts:
//   firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead "npm --prefix app run e2e"
const SLUG = 'troop-505-domain';

test.beforeAll(async () => {
  await resetEmulators();
  await fetch('http://127.0.0.1:9199/internal/reset', { method: 'POST' });
});

test('a leader connects their own domain, sees the DNS records to add, then removes it', async ({ browser }) => {
  const leader = await signedIn(browser, 'domain-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 505');
  await leader.getByLabel('Unit number').fill('505');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 505' })).toBeVisible();

  await leader.getByRole('link', { name: 'Website' }).click();
  await expect(leader.getByRole('heading', { name: 'Use your own domain' })).toBeVisible();

  // Not published yet: the box explains why it can't be used.
  await expect(leader.getByText('Publish your website first.')).toBeVisible();
  await expect(leader.getByRole('button', { name: 'Use this domain' })).toBeDisabled();

  await leader.getByLabel('Web address').fill(SLUG);
  await leader.getByLabel('About your troop').fill('We camp every month.');
  await leader.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(leader.getByText('Published. Your site is at')).toBeVisible();

  // Bad input is caught as the leader types.
  const box = leader.getByLabel('Your domain');
  await box.fill('https://troop505.org');
  await expect(leader.getByText(/without https/)).toBeVisible();
  await box.fill('forthrightapp.com');
  await expect(leader.getByText(/belongs to Forthright or Google/)).toBeVisible();
  await expect(leader.getByRole('button', { name: 'Use this domain' })).toBeDisabled();

  // A good one: the steps and the exact records appear.
  await box.fill('Troop505Springfield.org');
  await leader.getByRole('button', { name: 'Use this domain' }).click();
  await expect(leader.getByText('Waiting for your DNS records.')).toBeVisible();
  await expect(leader.getByText('troop505springfield.org', { exact: true }).first()).toBeVisible();
  await expect(leader.getByRole('heading', { name: 'Add these records at your registrar' })).toBeVisible();
  await expect(leader.getByText(/Sign in to the company where you bought troop505springfield.org/)).toBeVisible();
  const records = leader.getByRole('table', { name: 'DNS records to set at your registrar' });
  await expect(records.getByRole('row', { name: /Add A .*199\.36\.158\.100/ })).toBeVisible();
  await expect(records.getByRole('row', { name: /Add TXT/ })).toBeVisible();

  // Checking again keeps waiting (the fake finds no records yet) and says so in plain words.
  await leader.getByRole('button', { name: 'Check again' }).click();
  await expect(leader.getByText('Waiting for your DNS records.')).toBeVisible();

  // Only one domain per troop: the add box is gone until this one is removed.
  await expect(leader.getByLabel('Your domain')).toHaveCount(0);

  await leader.getByRole('button', { name: 'Remove this domain' }).click();
  await expect(leader.getByText('Your domain was disconnected.')).toBeVisible();
  await expect(leader.getByLabel('Your domain')).toBeVisible();
});

test('a page served on a troop domain shows the troop site at the root with no sign-in', async ({ browser }) => {
  // The server marks the page it serves on a troop domain; stand in for that here by adding the marker.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.route('**/', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }
    const res = await route.fetch();
    const body = (await res.text()).replace('</head>', `<meta name="forthright-site" content="${SLUG}" /></head>`);
    await route.fulfill({ response: res, body });
  });
  await visitor.goto('/');
  await expect(visitor.getByRole('heading', { name: 'Troop 505', level: 1 })).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  await expect(visitor.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'https://forthrightapp.com/privacy');
});
