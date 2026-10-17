import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/** Where a troop's own domain has got to. "failed" ends the wait. */
export type DomainStatus = 'waiting_dns' | 'verifying' | 'issuing_certificate' | 'live' | 'failed';

export interface DnsRecord {
  type: string;
  /** The full name the record is for, such as troop101.org or www.troop101.org. */
  name: string;
  /** What registrars ask for: "@" for the domain itself, else the part before it. */
  label: string;
  value: string;
  action: 'add' | 'remove';
  purpose: 'ownership' | 'traffic' | 'certificate';
}

/** `troops/{t}/site/domain`, written only by the domain functions. */
export interface TroopDomain {
  host: string;
  wwwHost: string | null;
  status: DomainStatus;
  wwwStatus: DomainStatus | null;
  headline: string;
  detail: string;
  records: DnsRecord[];
  steps: string[];
}

export const PENDING: DomainStatus[] = ['waiting_dns', 'verifying', 'issuing_certificate'];
/** The steps a domain goes through, for the progress list. */
export const PROGRESS: { status: DomainStatus; label: string }[] = [
  { status: 'waiting_dns', label: 'Add the DNS records' },
  { status: 'verifying', label: 'We check your records' },
  { status: 'issuing_certificate', label: 'Secure padlock (https) is set up' },
  { status: 'live', label: 'Your site is live' },
];

const BLOCKED = [
  'forthrightapp.com',
  'web.app',
  'firebaseapp.com',
  'firebaseio.com',
  'cloudfunctions.net',
  'appspot.com',
  'run.app',
  'googleapis.com',
  'googleusercontent.com',
];
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SHAPE = "That doesn't look like a domain. Use letters, numbers, dots and dashes, like troop101.org.";

/** Cleans what a leader typed. The server checks again; this gives quick feedback. */
export function cleanDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, '');
}

/** A reason the domain can't be used, or null if it looks fine. Mirrors the server's rules. */
export function domainProblem(raw: string): string | null {
  const text = cleanDomain(raw);
  if (!text) {
    return null;
  }
  if (/[/?#]/.test(text)) {
    return 'Enter just the domain, like troop101springfield.org, without https:// or a page.';
  }
  if (/[@\s:*]/.test(text)) {
    return SHAPE;
  }
  const labels = text.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) {
    return SHAPE;
  }
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels[labels.length - 1])) {
    return "That doesn't look like a domain. It should end in .org, .com or similar.";
  }
  if (BLOCKED.some((b) => text === b || text.endsWith(`.${b}`)) || ['localhost', 'local', 'internal'].includes(labels[labels.length - 1])) {
    return "That address belongs to Forthright or Google, so you can't use it. Use a domain you own.";
  }
  return null;
}

/** Index of a status in PROGRESS, for ticking steps off; -1 when failed. */
export function progressIndex(status: DomainStatus): number {
  return PROGRESS.findIndex((p) => p.status === status);
}

const call = async <In, Out>(name: string, data: In): Promise<Out> => (await httpsCallable<In, Out>(functions, name)(data)).data;

export const addDomain = (troopId: string, domain: string, www: boolean) =>
  call<{ troopId: string; domain: string; www: boolean }, TroopDomain>('add_domain', { troopId, domain: cleanDomain(domain), www });
export const checkDomain = (troopId: string) => call<{ troopId: string }, TroopDomain>('check_domain', { troopId });
export const removeDomain = (troopId: string) => call<{ troopId: string }, { removed: boolean }>('remove_domain', { troopId });
