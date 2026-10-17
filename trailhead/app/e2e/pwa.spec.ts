import { expect, test } from '@playwright/test';

// The service worker only registers in a production build, which playwright.config.ts serves on this port.
const BUILD = 'http://localhost:5182';

test('the web app manifest describes an installable app', async ({ page, request }) => {
  await page.goto(`${BUILD}/`);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/site.webmanifest');
  const manifest = await (await request.get(`${BUILD}${href}`)).json();
  expect(manifest).toMatchObject({ name: 'Forthright', display: 'standalone', start_url: '/', theme_color: '#4f6a2e' });
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']));
  for (const icon of manifest.icons) {
    expect((await request.get(`${BUILD}${icon.src}`)).status()).toBe(200);
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
});

test('the worker is served fresh and the offline page shows with no signal', async ({ page, context, request }) => {
  const worker = await request.get(`${BUILD}/sw.js`);
  expect(await worker.text()).not.toContain("'__BUILD_ID__'"); // the build stamped a release fingerprint on it

  await page.goto(`${BUILD}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(1);

  // Nothing has been visited under the worker's control yet, so a new address falls back to the offline page.
  await context.setOffline(true);
  await page.goto(`${BUILD}/never-visited`).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
});

test('the app opens offline once it has been visited, and troop sites, calendar feeds and sign-in paths are never cached', async ({
  page,
  context,
}) => {
  await page.goto(`${BUILD}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker, which stores the page
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.goto(`${BUILD}/s/some-troop`).catch(() => undefined);
  await page.goto(`${BUILD}/cal/not-a-real-key.ics`).catch(() => undefined);
  await page.goto(`${BUILD}/`);

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        urls.push(new URL(request.url).pathname);
      }
    }
    return urls;
  });
  expect(cached).toContain('/offline.html');
  expect(cached.filter((p) => p.startsWith('/s/') || p.startsWith('/cal/') || p.startsWith('/__/'))).toEqual([]);

  await context.setOffline(true);
  await page.goto(`${BUILD}/signin`);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await context.setOffline(false);
});
