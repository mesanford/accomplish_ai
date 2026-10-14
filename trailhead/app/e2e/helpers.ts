import { existsSync, readFileSync } from 'node:fs';
import { dirname, join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';

const FIXTURES = joinPath(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'requirements');

/**
 * Serve small requirement files from e2e/fixtures/requirements so tests do not depend on the real data.
 * Awards without a fixture (anything but camping, chess, cooking and tenderfoot) answer 404, which is what
 * the app sees when a requirements file is missing.
 */
export async function mockRequirements(context: BrowserContext): Promise<void> {
  await context.route('**/requirements/*.json', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()?.replace(/\.json$/, '') ?? '';
    const file = joinPath(FIXTURES, `${id}.json`);
    if (existsSync(file)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf8') });
    } else {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
}

const PROJECT = 'demo-trailhead';

/** Clear the emulators so each run starts from an empty troop. */
export async function resetEmulators(): Promise<void> {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** A fresh browser session, signed in by email link through the Auth emulator. */
export async function signedIn(browser: Browser, email: string, startAt = '/'): Promise<Page> {
  const context = await browser.newContext();
  await mockRequirements(context);
  const page = await context.newPage();
  await page.goto(startAt);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await page.getByRole('button', { name: 'Open sign-in link (local emulator)' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeHidden();
  return page;
}

export async function createInviteLink(page: Page, role: string, scoutName?: string): Promise<string> {
  await page.getByLabel('Invite as').selectOption(role);
  if (scoutName) {
    await page.getByRole('checkbox', { name: scoutName }).check();
  }
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const link = page.getByLabel('Invite link');
  await expect(link).toHaveValue(/\/join\//);
  return new URL(await link.inputValue()).pathname;
}

export async function join(page: Page, name: string, ypt?: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Join your troop' })).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  if (ypt) {
    await page.getByLabel('Youth Protection training expires').fill(ypt);
  }
  await page.getByRole('button', { name: 'Join troop' }).click();
}

export function inOneYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
