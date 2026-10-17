import { expect, type Page } from '@playwright/test';
import { inOneYear } from './helpers';

const OUTBOX = 'http://127.0.0.1:8080/v1/projects/demo-trailhead/databases/(default)/documents/emailOutbox';

interface Mail {
  template: string;
  to: string;
  text: string;
}

/** Every email the Functions emulator logged (it writes them to `emailOutbox` instead of sending). */
export async function outbox(template?: string): Promise<Mail[]> {
  const res = await fetch(OUTBOX, { headers: { Authorization: 'Bearer owner' } });
  const body = await res.json();
  const mails = (body.documents ?? []).map((d: { fields: Record<string, { stringValue: string }> }) => ({
    template: d.fields.template.stringValue,
    to: d.fields.to.stringValue,
    text: d.fields.text.stringValue,
  }));
  return template ? mails.filter((m: Mail) => m.template === template) : mails;
}

/** The path of the personal link in the consent email sent to this address, once it has been logged. */
export async function consentLinkFor(email: string): Promise<string> {
  let path = '';
  await expect
    .poll(async () => {
      const mail = (await outbox('consent_request')).find((m) => m.to === email);
      path = mail?.text.match(/\/join\/[^\s]+/)?.[0] ?? '';
      return path;
    })
    .not.toBe('');
  return path;
}

/** A leader creates a troop and lands on the Roster. */
export async function createTroopAsLeader(leader: Page, name: string, unit: string): Promise<string> {
  await leader.getByRole('link', { name: 'Create a troop' }).click();
  await leader.getByLabel('Troop name').fill(name);
  await leader.getByLabel('Unit number').fill(unit);
  await leader.getByLabel('Your name').fill('Pat Leader');
  await leader.getByLabel('Youth Protection training expires').fill(inOneYear());
  await leader.getByRole('button', { name: 'Create troop' }).click();
  await expect(leader.getByRole('heading', { name })).toBeVisible();
  const troopId = leader.url().split('/t/')[1].split('/')[0];
  await leader.getByRole('link', { name: 'Roster' }).click();
  return troopId;
}

/** A leader adds a Scout under 13 (10 years old) with one or two parent emails. */
export async function addYoungScout(leader: Page, scout: string, parents: { name: string; email: string }[]): Promise<void> {
  await leader.getByLabel("Scout's name").fill(scout);
  await leader.getByLabel('Birth month').selectOption('1');
  await leader.getByLabel('Birth year').fill(String(new Date().getFullYear() - 10));
  for (const [i, p] of parents.entries()) {
    if (i > 0) {
      await leader.getByRole('button', { name: 'Add another parent or guardian' }).click();
    }
    await leader.locator(`#add-parent-name-${i}`).fill(p.name);
    await leader.locator(`#add-parent-email-${i}`).fill(p.email);
  }
  await leader.getByRole('button', { name: 'Add Scout' }).click();
  await expect(leader.getByText(/We emailed the parent/)).toBeVisible();
}
