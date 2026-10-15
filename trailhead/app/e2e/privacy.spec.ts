import { expect, test } from '@playwright/test';

test('anyone can read the privacy policy without signing in', async ({ page }) => {
  await page.goto('/signin');
  await page.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Children's privacy" })).toBeVisible();
  await expect(page.getByText('Scouts under 13 cannot have their own Forthright login.')).toBeVisible();
  await expect(page.getByText(/run by MM Sanford/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'privacy@msanford.com' })).toHaveAttribute('href', 'mailto:privacy@msanford.com');
});
