import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { inOneYear, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

const SHOTS = '/tmp/guidance-shots';

test('new leaders get guidance: checklist, help tips, how-this-page-works panels and the Help page', async ({ browser }) => {
  mkdirSync(SHOTS, { recursive: true });
  const leader = await signedIn(browser, 'guide-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 202');
  await leader.getByLabel('Unit number').fill('202');
  await leader.getByLabel('Your name').fill('Lee Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 202' })).toBeVisible();

  // A new troop sees the Getting started card with nothing ticked.
  const card = leader.getByRole('region', { name: 'Getting started' });
  await expect(card).toBeVisible();
  await expect(card.getByText('0 of 6 done')).toBeVisible();
  await leader.screenshot({ path: `${SHOTS}/leader-home.png`, fullPage: true });

  // Adding a Scout ticks the first item off.
  await leader.getByRole('link', { name: 'Roster' }).click();
  await expect(leader.getByRole('region', { name: 'How this page works' })).toBeVisible();
  await leader.getByLabel("Scout's name").fill('Alex');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Alex', exact: true })).toBeVisible();
  await leader.getByRole('link', { name: 'Home' }).click();
  await expect(leader.getByRole('region', { name: 'Getting started' }).getByText('1 of 6 done')).toBeVisible();

  // A help tip opens on click (so it works by touch) and closes on Escape.
  await leader.getByRole('link', { name: 'Roster' }).click();
  const tip = leader.getByRole('button', { name: 'Help: Who can do what' });
  await expect(tip).toHaveAttribute('aria-expanded', 'false');
  await tip.click();
  await expect(tip).toHaveAttribute('aria-expanded', 'true');
  await expect(leader.getByText(/Counselors sign off merit badges for Scouts assigned to them/)).toBeVisible();
  await leader.keyboard.press('Escape');
  await expect(tip).toHaveAttribute('aria-expanded', 'false');
  await expect(leader.getByText(/Counselors sign off merit badges for Scouts assigned to them/)).toBeHidden();

  // The how-this-page-works panel hides, stays hidden after a reload, and comes back with Show tips.
  await leader.getByRole('button', { name: 'Got it, hide this' }).click();
  await expect(leader.getByRole('region', { name: 'How this page works' })).toBeHidden();
  await leader.reload();
  await expect(leader.getByRole('button', { name: 'Show tips' })).toBeVisible();
  await expect(leader.getByRole('region', { name: 'How this page works' })).toBeHidden();
  await leader.getByRole('button', { name: 'Show tips' }).click();
  await expect(leader.getByRole('region', { name: 'How this page works' })).toBeVisible();
  await leader.screenshot({ path: `${SHOTS}/roster-guide.png` });

  // A tip on a phone-size screen.
  await leader.setViewportSize({ width: 390, height: 800 });
  await leader.getByRole('button', { name: 'Help: Who can do what' }).click();
  await expect(leader.getByRole('button', { name: 'Close' })).toBeVisible();
  await leader.screenshot({ path: `${SHOTS}/phone-helptip.png` });
  await leader.keyboard.press('Escape');
  await leader.setViewportSize({ width: 1280, height: 800 });

  // The Help page lists the guides and the glossary, and search narrows them.
  await leader.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(leader.getByRole('heading', { name: 'How to use Forthright' })).toBeVisible();
  await expect(leader.getByRole('heading', { name: "I'm a leader" })).toBeVisible();
  await expect(leader.getByRole('heading', { name: 'Scouting words, explained' })).toBeVisible();
  await expect(leader.getByText('The Application for Merit Badge, a paper form.').first()).toBeVisible();
  await leader.screenshot({ path: `${SHOTS}/help-page.png`, fullPage: true });
  await leader.getByLabel('Search help').fill('YPT');
  await expect(leader.getByRole('term').filter({ hasText: 'YPT' })).toBeVisible();
  await expect(leader.getByRole('term').filter({ hasText: 'Patrol' })).toBeHidden();
});
