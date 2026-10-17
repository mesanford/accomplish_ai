import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A fake Stripe API for browser tests. The Functions emulator talks to it once `_test/payments` points there; the
 * browser never reaches Stripe either, because tests route checkout.stripe.com and connect.stripe.com themselves. */

export interface SeenRequest {
  method: string;
  path: string;
  form: URLSearchParams;
  headers: IncomingMessage['headers'];
}

export interface FakeStripe {
  base: string;
  requests: SeenRequest[];
  close: () => Promise<void>;
}

export async function startFakeStripe(): Promise<FakeStripe> {
  const requests: SeenRequest[] = [];
  let sessions = 0;
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const path = req.url ?? '';
      const form = new URLSearchParams(raw);
      requests.push({ method: req.method ?? '', path, form, headers: req.headers });
      let body: Record<string, unknown>;
      if (req.method === 'POST' && path === '/v1/accounts') {
        body = { id: 'acct_e2e', charges_enabled: false };
      } else if (req.method === 'POST' && path === '/v1/account_links') {
        body = { url: `https://connect.stripe.com/setup/e2e?return=${encodeURIComponent(form.get('return_url') ?? '')}` };
      } else if (req.method === 'GET' && path.startsWith('/v1/accounts/')) {
        body = { id: 'acct_e2e', charges_enabled: true, details_submitted: true };
      } else if (req.method === 'POST' && path === '/v1/checkout/sessions') {
        sessions += 1;
        body = { id: `cs_test_e2e_${sessions}`, url: `https://checkout.stripe.com/c/pay/cs_test_e2e_${sessions}` };
      } else if (req.method === 'POST' && path.endsWith('/expire')) {
        body = { status: 'expired' };
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `no fake for ${req.method} ${path}` } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const DOCS = 'http://127.0.0.1:8080/v1/projects/demo-trailhead/databases/(default)/documents';

type Plain = string | number | boolean;

function encode(value: Plain) {
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return { integerValue: String(value) };
  }
  return { stringValue: value };
}

/** Write a document as the emulator's owner (rules don't apply), for seeding. */
export async function seedDoc(path: string, data: Record<string, Plain>): Promise<void> {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
  const res = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`seeding ${path} failed: ${res.status}`);
  }
}

/** Turn card payments on (test mode, this fake) or off for the Functions emulator. */
export const setPaymentsMode = (mode: 'off' | 'test', base = '') => seedDoc('_test/payments', { mode, apiBase: base });
