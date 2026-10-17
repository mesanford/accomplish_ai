import { expect, test } from '@playwright/test';
import { resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

test('a signed-out visitor sees the marketing page and can ask to join the pilot', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await expect(page).toHaveTitle(/advancement planning for Scouts BSA troops/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Advancement planning for Scouts BSA troops',
  );
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute(
    'href',
    '/signin',
  );
  await expect(
    page.getByRole('heading', { level: 2, name: 'Built for safety and privacy' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read the privacy policy' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  await expect(page.getByRole('link', { name: 'privacy@msanford.com' })).toHaveAttribute(
    'href',
    'mailto:privacy@msanford.com',
  );
  await expect(page.getByRole('contentinfo')).toContainText(
    'Forthright is an independent product and is not affiliated with, sponsored or endorsed by Scouting America. Scouts BSA and Scoutbook are trademarks of Scouting America.',
  );

  // A missing field is named before anything is sent.
  await page.getByLabel('Your name').fill('Pat Leader');
  await page.getByRole('button', { name: 'Send my request' }).click();
  await expect(page.getByRole('alert')).toContainText('Still needed');

  await page.getByLabel('Email', { exact: true }).fill('pat@example.com');
  await page.getByLabel('Troop or unit number').fill('303');
  await page.getByLabel('Council (optional)').fill('Pine Council');
  await page.getByLabel('Your role').selectOption('Scoutmaster');
  await page.getByLabel(/Anything you'd like us to know/).fill('We have 20 Scouts.');
  await page.getByRole('button', { name: 'Send my request' }).click();
  await expect(page.getByRole('status')).toContainText('Thank you.');
});

test('a signed-in user at "/" still sees their troops', async ({ browser }) => {
  const page = await signedIn(browser, 'leader@example.com');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Your troops' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /Advancement planning/ })).toHaveCount(
    0,
  );
});

test('the marketing page does not scroll sideways at 375px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByText('Questions and answers').scrollIntoViewIfNeeded();
  const widths = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  expect(widths.doc).toBeLessThanOrEqual(widths.win);
});

test('the features page lists every category, jumps to one, and leads to the pilot form', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByRole('link', { name: 'See every feature' }).click();
  await expect(page).toHaveURL(/\/features$/);
  await expect(page).toHaveTitle(/Features/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Everything your troop runs, in one place',
  );
  const categories = page.getByRole('navigation', { name: 'Feature categories' }).getByRole('link');
  await expect(categories).toHaveCount(10);
  await page.getByRole('link', { name: 'Equipment and library' }).click();
  await expect(page).toHaveURL(/#equipment$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Equipment and library' }),
  ).toBeInViewport();
  // Built but not switched on yet, and labeled so.
  await expect(page.getByRole('heading', { level: 3, name: /Pay online/ })).toContainText(
    'Coming soon',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole('link', { name: 'Ask to join the pilot' }).click();
  await expect(page).toHaveURL(/\/#pilot$/);
  await expect(page.getByRole('heading', { name: 'How the pilot works' })).toBeInViewport();
});

test('the features page fits a phone screen', async ({ browser }) => {
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 800 } })
  ).newPage();
  await page.goto('/features');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Scout accounts and fundraising' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 375)).toBe(true);
});
