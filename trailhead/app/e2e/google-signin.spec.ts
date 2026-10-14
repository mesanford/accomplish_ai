import { expect, test } from '@playwright/test';
import { resetEmulators } from './helpers';

test.beforeAll(resetEmulators);

test('Continue with Google signs in and returns to where the person was going', async ({ page }) => {
  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // The Auth emulator stands in for Google with its own account-picker popup.
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const popup = await popupPromise;
  // The popup's script can attach its handlers after the page appears, so retry until the click takes.
  await popup.waitForLoadState('networkidle');
  await expect(async () => {
    await popup.getByText('Add new account').first().click();
    await expect(popup.getByText('Auto-generate user information')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await popup.getByText('Auto-generate user information').click();
  await popup.getByText('Sign in with Google.com').click();

  await expect(page.getByRole('heading', { name: 'Create a troop' })).toBeVisible();
});
