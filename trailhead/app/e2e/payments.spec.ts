import { expect, test } from '@playwright/test';
import { type FakeStripe, seedDoc, setPaymentsMode, startFakeStripe } from './fakeStripe';
import { createInviteLink, inOneYear, join, joinAsParent, resetEmulators, signedIn } from './helpers';

// Card payments with Stripe stubbed: the Functions emulator talks to a fake Stripe API, and the browser's trips to
// Stripe's hosted pages are answered here. Nothing reaches Stripe.
let fake: FakeStripe;

test.beforeAll(async () => {
  await resetEmulators();
  fake = await startFakeStripe();
});

test.afterAll(async () => {
  await setPaymentsMode('off').catch(() => undefined);
  await fake?.close();
});

test('the treasurer connects Stripe and a parent sees Pay online', async ({ browser }) => {
  const leader = await signedIn(browser, 'pay-leader@example.com');
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill('Troop 606');
  await leader.getByLabel('Unit number').fill('606');
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name: 'Troop 606' })).toBeVisible();
  const troopId = new URL(leader.url()).pathname.split('/')[2];
  await leader.getByRole('link', { name: 'Roster' }).click();
  await leader.getByLabel("Scout's name").fill('Sam');
  await leader.getByLabel('Birth month').selectOption('3');
  await leader.getByLabel('Birth year').fill('2012');
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await leader.getByRole('link', { name: 'Sam', exact: true }).click();
  const scoutId = new URL(leader.url()).pathname.split('/')[4];
  await leader.getByRole('link', { name: 'Roster' }).click();
  const treasurerInvite = await createInviteLink(leader, 'treasurer');
  const parentInvite = await createInviteLink(leader, 'parent', 'Sam');

  // With payments off (the default), the treasurer sees no card payment settings at all.
  const treasurer = await signedIn(browser, 'pay-treasurer@example.com', treasurerInvite);
  await join(treasurer, 'Terry Treasurer');
  await expect(treasurer.getByRole('heading', { name: 'Troop 606' })).toBeVisible();
  await treasurer.goto(`/t/${troopId}/accounts/settings`);
  await expect(treasurer.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  await expect(treasurer.getByRole('button', { name: 'Connect Stripe' })).toBeHidden();

  // Payments on (test mode). Stripe's onboarding page is stubbed: it sends the treasurer straight back.
  await setPaymentsMode('test', fake.base);
  await treasurer.context().route('https://connect.stripe.com/**', async (route) => {
    const back = new URL(route.request().url()).searchParams.get('return') ?? '/';
    await route.fulfill({ status: 302, headers: { Location: back } });
  });
  await treasurer.reload();
  const card = treasurer.getByRole('region', { name: 'Card payments' });
  await expect(card.getByText('Stripe test mode: no real money moves.')).toBeVisible();
  await card.getByRole('button', { name: 'Connect Stripe' }).click();
  await expect(treasurer).toHaveURL(/stripe=return/);
  await expect(card.getByText('Connected.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Disconnect Stripe' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Connect Stripe' })).toBeHidden();
  expect(fake.requests.some((r) => r.method === 'POST' && r.path === '/v1/accounts')).toBe(true);
  await expect(treasurer.getByLabel('Add the card processing fee')).toBeVisible();

  // An open charge for Sam (seeded directly; posting charges has its own tests).
  await seedDoc(`troops/${troopId}/ledger/charge-e2e`, {
    scoutId,
    type: 'charge',
    amountCents: -3500,
    fromCredit: false,
    description: 'Fall campout',
    date: new Date().toISOString().slice(0, 10),
    createdBy: 'system',
    createdByName: 'Forthright',
  });

  // The parent sees Pay online on Sam's account. Stripe's Checkout page is stubbed.
  const parent = await signedIn(browser, 'pay-parent@example.com', parentInvite);
  await joinAsParent(parent, 'Jordan Parent');
  await parent.context().route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Fake Stripe Checkout</h1>' }),
  );
  await parent.goto(`/t/${troopId}/scouts/${scoutId}`);
  const pay = parent.getByRole('form', { name: 'Pay online' });
  await expect(pay.getByRole('checkbox', { name: 'Fall campout, $35.00' })).toBeChecked();
  await pay.getByRole('button', { name: 'Pay $35.00 by card' }).click();
  await expect(parent.getByRole('heading', { name: 'Fake Stripe Checkout' })).toBeVisible();
  expect(parent.url()).toContain('https://checkout.stripe.com/c/pay/cs_test_e2e_');
  const session = fake.requests.find((r) => r.path === '/v1/checkout/sessions');
  expect(session?.headers['stripe-account']).toBe('acct_e2e');
  expect(session?.form.get('line_items[0][price_data][unit_amount]')).toBe('3500');
  expect(session?.form.get('line_items[0][price_data][product_data][name]')).toBe('Troop 606 activity fees');

  // Coming back after cancelling says nothing was charged.
  await parent.goto(`/t/${troopId}/scouts/${scoutId}?payment=cancelled`);
  await expect(parent.getByText('Payment cancelled. Nothing was charged.')).toBeVisible();
});
