/** Money on screen and in forms. Amounts are whole US cents everywhere; only these helpers turn them into dollars. */

/** "$12.50", "$1,250.00", or "-$5.00" for an amount below zero. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** A dollar amount typed by a person ("12.5", "$1,250", "35") as cents, or null if it isn't one. */
export function parseDollars(text: string): number | null {
  const clean = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) {
    return null;
  }
  const [whole, part = ''] = clean.split('.');
  return Number(whole) * 100 + Number(part.padEnd(2, '0'));
}

/** Cents as the plain text a form field starts with: "12.50", or "" for nothing. */
export function centsToInput(cents: number | undefined): string {
  return cents ? (cents / 100).toFixed(2) : '';
}

/** A percentage typed by a person ("30", "12.5") as basis points (3000, 1250), or null. */
export function parsePercent(text: string): number | null {
  const clean = text.trim().replace(/%$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) {
    return null;
  }
  const bps = Math.round(Number(clean) * 100);
  return bps <= 10000 ? bps : null;
}

/** Basis points as a percentage for display: 3000 is "30%", 1250 is "12.5%". */
export function formatPercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

export const MAX_CENTS = 1_000_000;

/** Why a typed amount can't be used, or null. */
export function amountProblem(text: string): string | null {
  const cents = parseDollars(text);
  if (cents === null) {
    return 'Enter an amount in dollars, like 35 or 12.50.';
  }
  if (cents <= 0) {
    return 'Enter an amount more than $0.00.';
  }
  if (cents > MAX_CENTS) {
    return 'Enter an amount of $10,000.00 or less.';
  }
  return null;
}
