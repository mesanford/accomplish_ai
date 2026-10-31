import { expect, test } from '@playwright/test';
import { createInviteLink, inOneYear, joinAsParent, resetEmulators, signedIn } from './helpers';

test.beforeAll(resetEmulators);

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('a leader researches, plans and publishes a campout, and a parent sees the family notes', async ({ browser }) => {
  const leader = await signedIn(browser, 'plan-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 505');
  await leader.getByLabel('Unit number').fill('505');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 505' })).toBeVisible();
  await leader.getByRole('link', { name: 'Roster', exact: true }).click();
  await leader.getByLabel("Scout's name").fill('Riley');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 14));
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  const invite = await createInviteLink(leader, 'parent', 'Riley');

  // Start a campout plan from the Events page.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByRole('link', { name: 'Plan a trip' }).click();
  await leader.getByLabel('Kind').selectOption('campout');
  await leader.getByLabel('Name').fill('Fall campout');
  await leader.getByRole('button', { name: 'Start the plan' }).click();
  await expect(leader.getByRole('heading', { name: 'Fall campout' })).toBeVisible();

  // The plan starts with questions, one at a time, then shows ideas that fit the answers.
  await expect(leader.getByText('Question 1 of 7')).toBeVisible();
  await leader.getByRole('radio', { name: '1 or 2 nights (a weekend)' }).check();
  await leader.getByRole('button', { name: 'Next' }).click();
  await leader.getByRole('radio', { name: 'Fall' }).check();
  await leader.getByRole('button', { name: 'Next' }).click();
  await leader.getByRole('radio', { name: 'Up to 2 hours' }).check();
  await leader.getByRole('button', { name: 'Next' }).click();
  await leader.getByRole('checkbox', { name: 'Canoeing or kayaking' }).check();
  await leader.getByRole('button', { name: 'Next' }).click();
  await leader.getByRole('radio', { name: 'Tents' }).check();
  await leader.getByRole('button', { name: 'Next' }).click();
  await leader.getByRole('button', { name: 'Skip' }).click(); // no must-haves
  await leader.getByRole('radio', { name: 'Up to $50' }).check();
  await leader.getByRole('button', { name: 'Show us ideas' }).click();
  await expect(leader.getByText('How long: 1 or 2 nights (a weekend)')).toBeVisible();
  const ideas = leader.getByRole('region', { name: 'Ideas to try' });
  await expect(ideas.getByText('A canoe or kayak trip on a lake or slow river')).toBeVisible();
  await ideas.getByRole('button', { name: 'Add this idea' }).first().click();
  await expect(leader.getByText('Added to your ideas.')).toBeVisible();

  // Research: one place, marked booked; then record the decision.
  await leader.getByRole('button', { name: 'Add an option' }).click();
  const optionForm = leader.locator('form').filter({ has: leader.getByRole('button', { name: 'Save option' }) });
  await optionForm.getByLabel('Name', { exact: true }).fill('Pine Lake State Park');
  await optionForm.getByLabel('Availability').selectOption('booked');
  await optionForm.getByRole('button', { name: 'Save option' }).click();
  await expect(leader.getByText('Pine Lake State Park').first()).toBeVisible();
  await leader.getByRole('button', { name: 'Decide', exact: true }).click();
  await leader.getByLabel('Chosen option').selectOption({ label: 'Pine Lake State Park' });
  await leader.getByLabel('How the vote went').fill('PLC chose Pine Lake, 6-2');
  await leader.getByRole('button', { name: 'Save decision' }).click();

  // Plan: dates, place, notes for families, and who is going.
  await leader.getByRole('button', { name: 'Plan', exact: true }).click();
  await leader.getByLabel('First day', { exact: true }).fill(inDays(30));
  await leader.getByLabel('Last day', { exact: true }).fill(inDays(32));
  await leader.getByLabel('Place', { exact: true }).fill('Pine Lake State Park');
  await leader.getByLabel('Notes for families').fill('Meet at the church at 5 pm.');
  await leader.getByRole('button', { name: 'Save the plan' }).click();
  await expect(leader.getByText(/Saved/).first()).toBeVisible();
  await leader.getByRole('checkbox', { name: 'Pat Leader' }).check();
  await leader.getByRole('radio', { name: 'Families drive their own Scouts' }).check();
  await leader.getByRole('button', { name: 'Save adults and drivers' }).click();

  // Ready: one adult fails two-deep; the leader acknowledges it with a note.
  await leader.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(leader.getByText(/Forthright is a planning aid/)).toBeVisible();
  await expect(leader.getByText('Fewer than two adults are planned.')).toBeVisible();
  await leader.getByLabel('Why this is fine to go ahead (required)').fill('A district adult joins us.');
  await leader.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(leader.getByText(/Acknowledged by Pat Leader: A district adult joins us\./)).toBeVisible();

  // Publish: preview, then create the event.
  await leader.getByRole('button', { name: 'Publish', exact: true }).click();
  await leader.getByRole('button', { name: 'Preview' }).click();
  await expect(leader.getByRole('heading', { name: 'This will create an event' })).toBeVisible();
  await leader.getByRole('button', { name: 'Create the event' }).click();
  await expect(leader.getByText('Published.')).toBeVisible();

  // The event is an ordinary event that links back to the plan.
  await leader.getByRole('link', { name: 'Events', exact: true }).click();
  await leader.getByRole('link', { name: 'Fall campout' }).click();
  await expect(leader.getByText(/Pine Lake State Park/).first()).toBeVisible();
  await expect(leader.getByRole('link', { name: 'Planned in Forthright: open the plan' })).toBeVisible();
  await expect(leader.getByText('Meet at the church at 5 pm.')).toBeVisible();

  // A parent sees the family notes but no plan.
  const parent = await signedIn(browser, 'plan-parent@example.com', invite);
  await joinAsParent(parent, 'Jordan Parent');
  await parent.getByRole('link', { name: 'Events', exact: true }).click();
  await parent.getByRole('link', { name: 'Fall campout' }).click();
  await expect(parent.getByText('Meet at the church at 5 pm.')).toBeVisible();
  await expect(parent.getByRole('link', { name: 'Planned in Forthright: open the plan' })).toHaveCount(0);
  await expect(parent.getByRole('link', { name: 'Plan a trip' })).toHaveCount(0);
});
