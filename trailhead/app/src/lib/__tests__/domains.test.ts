import { describe, expect, it } from 'vitest';
import { cleanDomain, domainProblem, PROGRESS, progressIndex } from '../domains';
import { forthrightUrl, readSiteMarker, siteBase } from '../troopDomain';

describe('domainProblem', () => {
  it('accepts ordinary domains and says nothing about an empty box', () => {
    for (const ok of ['troop101springfield.org', 'Troop101.ORG', 'www.troop101.org', 'troop-101.example.co.uk', ' troop101.org. ']) {
      expect(domainProblem(ok)).toBeNull();
    }
    expect(domainProblem('')).toBeNull();
    expect(domainProblem('   ')).toBeNull();
  });

  it('explains what is wrong with a bad one', () => {
    expect(domainProblem('https://troop101.org')).toMatch(/without https/);
    expect(domainProblem('troop101.org/about')).toMatch(/without https/);
    for (const bad of ['troop101', 'me@troop101.org', 'troop 101.org', '*.troop101.org', 'troop101.org:8080', '-a.org', 'a..org']) {
      expect(domainProblem(bad), bad).toMatch(/doesn't look like a domain/);
    }
    expect(domainProblem('troop.123')).toMatch(/end in/);
  });

  it('refuses Forthright and Firebase addresses but not lookalikes', () => {
    for (const mine of ['forthrightapp.com', 'www.forthrightapp.com', 'x.web.app', 'x.firebaseapp.com', 'printer.local']) {
      expect(domainProblem(mine), mine).toMatch(/belongs to Forthright or Google/);
    }
    expect(domainProblem('notforthrightapp.com')).toBeNull();
  });

  it('lowercases and trims what is sent', () => {
    expect(cleanDomain('  Troop101.ORG. ')).toBe('troop101.org');
  });
});

describe('progress', () => {
  it('orders the steps and marks a failed domain as off the path', () => {
    expect(PROGRESS.map((p) => p.status)).toEqual(['waiting_dns', 'verifying', 'issuing_certificate', 'live']);
    expect(progressIndex('issuing_certificate')).toBe(2);
    expect(progressIndex('failed')).toBe(-1);
  });
});

describe('a troop on its own domain', () => {
  const doc = (content?: string) => ({
    querySelector: () => (content === undefined ? null : ({ content } as HTMLMetaElement)),
  });

  it('reads the marker the server puts in the page', () => {
    expect(readSiteMarker(doc('Troop-101'))).toBe('troop-101');
    expect(readSiteMarker(doc('  '))).toBeNull();
    expect(readSiteMarker(doc())).toBeNull();
  });

  it('puts the site at the root on a troop domain and under /s/ on Forthright', () => {
    expect(siteBase('troop-101', true)).toBe('');
    expect(siteBase('troop-101', false)).toBe('/s/troop-101');
  });

  it('sends links to Forthright itself off the troop domain', () => {
    expect(forthrightUrl('/privacy', true)).toBe('https://forthrightapp.com/privacy');
    expect(forthrightUrl('/privacy', false)).toBe('/privacy');
  });
});
