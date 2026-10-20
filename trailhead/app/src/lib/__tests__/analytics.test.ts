import { describe, expect, it } from 'vitest';
import { GTM_ID, loadTagManager, mayLoad, tagManagerLoaded } from '../analytics';

describe('mayLoad', () => {
  const visitor = { host: 'forthrightapp.com', signedIn: false, gpc: false };

  it('loads only on the live site, for signed-out visitors without a privacy signal', () => {
    expect(mayLoad(visitor)).toBe(true);
    expect(mayLoad({ ...visitor, host: 'www.forthrightapp.com' })).toBe(true);
  });

  it('never loads for someone signed in, on staging or locally, or with Global Privacy Control', () => {
    expect(mayLoad({ ...visitor, signedIn: true })).toBe(false);
    expect(mayLoad({ ...visitor, host: 'scout-app-d2282.web.app' })).toBe(false);
    expect(mayLoad({ ...visitor, host: 'localhost' })).toBe(false);
    expect(mayLoad({ ...visitor, host: 'troop101.org' })).toBe(false); // a troop's own domain
    expect(mayLoad({ ...visitor, gpc: true })).toBe(false);
  });
});

describe('loadTagManager', () => {
  it('adds the snippet once', () => {
    const appended: { src: string; async: boolean }[] = [];
    const doc = {
      createElement: () => ({ src: '', async: false }),
      head: { appendChild: (s: { src: string; async: boolean }) => appended.push(s) },
    } as unknown as Document;
    const win = {} as Window & { dataLayer?: unknown[] };
    expect(tagManagerLoaded(win)).toBe(false);
    loadTagManager(win, doc);
    loadTagManager(win, doc);
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`);
    expect(appended[0].async).toBe(true);
    expect(win.dataLayer?.[0]).toMatchObject({ event: 'gtm.js' });
    expect(tagManagerLoaded(win)).toBe(true);
  });
});
