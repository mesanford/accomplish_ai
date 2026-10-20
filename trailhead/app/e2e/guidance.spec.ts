import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, join, resetEmulators, signedIn } from './helpers';

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
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await expect(leader.getByRole('region', { name: 'How this page works' })).toBeVisible();
  await leader.getByLabel("Scout's name").fill('Alex');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByRole('link', { name: 'Alex', exact: true })).toBeVisible();
  await leader.getByRole('link', { name: 'Home' }).click();
  await expect(leader.getByRole('region', { name: 'Getting started' }).getByText('1 of 6 done')).toBeVisible();

  // A help tip opens on click (so it works by touch) and closes on Escape.
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
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

test('a treasurer and a quartermaster see their own Getting started lists and Help guides', async ({ browser }) => {
  mkdirSync(SHOTS, { recursive: true });
  const leader = await signedIn(browser, 'roles-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 707');
  await leader.getByLabel('Unit number').fill('707');
  await leader.getByLabel('Your name').fill('Lee Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 707' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  const treasurerInvite = await createInviteLink(leader, 'treasurer');
  const quartermasterInvite = await createInviteLink(leader, 'quartermaster');

  // A leader's Help page lists every guide. The treasurer guide stays closed, and search finds the shared guide.
  await leader.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(leader.getByRole('heading', { name: "I'm the treasurer" })).toBeVisible();
  await expect(leader.getByRole('heading', { name: 'Run a fundraiser' })).toBeHidden();
  await leader.getByLabel('Search help').fill('waitlist');
  await expect(leader.getByRole('heading', { name: 'For everyone: events, announcements and your phone' })).toBeVisible();
  await expect(leader.getByRole('heading', { name: 'Hold more than one role' })).toBeHidden();

  // The treasurer gets the treasurer list, not the leader list, and a guide that says what the role can and cannot do.
  const treasurer = await signedIn(browser, 'roles-treasurer@example.com', treasurerInvite);
  await join(treasurer, 'Tess Treasurer');
  await expect(treasurer.getByRole('heading', { name: 'Troop 707' })).toBeVisible();
  const tCard = treasurer.getByRole('region', { name: 'Getting started as treasurer' });
  await expect(tCard.getByText('0 of 4 done')).toBeVisible();
  await expect(tCard.getByRole('link', { name: 'Check the account settings' })).toBeVisible();
  await expect(treasurer.getByRole('region', { name: 'Getting started', exact: true })).toBeHidden();
  await expect(treasurer.getByRole('region', { name: 'Getting started as quartermaster' })).toBeHidden();
  await expect(treasurer.getByRole('link', { name: 'Roster', exact: true })).toBeHidden();
  await expect(treasurer.getByText(/Scout accounts are under Accounts/)).toBeVisible();
  await treasurer.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(treasurer.getByRole('heading', { name: "I'm the treasurer" })).toBeVisible();
  await expect(treasurer.getByRole('heading', { name: 'Run a fundraiser' })).toBeVisible();
  await expect(treasurer.getByRole('heading', { name: 'Settle a Scout who leaves' })).toBeVisible();
  await expect(treasurer.getByText(/Card payments may not be available yet/)).toBeVisible();
  await expect(treasurer.getByText('Pay out account credit as cash.', { exact: false })).toBeVisible();
  await expect(treasurer.getByRole('heading', { name: 'What you cannot see or change' }).first()).toBeVisible();
  await treasurer.screenshot({ path: `${SHOTS}/treasurer-help.png`, fullPage: true });
  await treasurer.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(treasurer.getByRole('button', { name: 'Help: Scout accounts' })).toBeVisible();

  // Saving the account settings ticks the first step.
  await treasurer.getByRole('link', { name: 'Account settings' }).click();
  await treasurer.getByRole('button', { name: 'Save settings' }).click();
  await expect(treasurer.getByText(/Saved\./)).toBeVisible();
  await treasurer.getByRole('link', { name: 'Home' }).click();
  await expect(treasurer.getByRole('region', { name: 'Getting started as treasurer' }).getByText('1 of 4 done')).toBeVisible();

  // The quartermaster gets the quartermaster list and guide, and nothing for the treasurer.
  const qm = await signedIn(browser, 'roles-qm@example.com', quartermasterInvite);
  await join(qm, 'Quinn Quartermaster');
  await expect(qm.getByRole('heading', { name: 'Troop 707' })).toBeVisible();
  const qCard = qm.getByRole('region', { name: 'Getting started as quartermaster' });
  await expect(qCard.getByText('0 of 3 done')).toBeVisible();
  await expect(qm.getByRole('region', { name: 'Getting started as treasurer' })).toBeHidden();
  await expect(qm.getByRole('link', { name: 'Accounts', exact: true })).toBeHidden();
  await qm.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(qm.getByRole('heading', { name: "I'm the quartermaster" })).toBeVisible();
  await expect(qm.getByRole('heading', { name: 'Keep a repair log' })).toBeVisible();
  await expect(qm.getByRole('heading', { name: 'Answer a request' })).toBeVisible();
  await expect(qm.getByRole('heading', { name: 'Run a fundraiser' })).toBeHidden();
  await qm.screenshot({ path: `${SHOTS}/quartermaster-help.png`, fullPage: true });

  // Adding an item ticks the first step.
  await qm.getByRole('link', { name: 'Equipment' }).click();
  await expect(qm.getByRole('button', { name: 'Help: Equipment' })).toBeVisible();
  await qm.getByRole('button', { name: 'Add an item' }).click();
  const addForm = qm.getByRole('form', { name: 'Add an item' });
  await addForm.getByLabel('Name', { exact: true }).fill('Tent 9');
  await addForm.getByLabel('Category').selectOption('tents');
  await qm.getByRole('button', { name: 'Add item' }).click();
  await expect(qm.getByRole('link', { name: 'Tent 9' })).toBeVisible();
  await qm.getByRole('link', { name: 'Home' }).click();
  await expect(qm.getByRole('region', { name: 'Getting started as quartermaster' }).getByText('1 of 3 done')).toBeVisible();
});
