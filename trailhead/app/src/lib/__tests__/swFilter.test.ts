import { describe, expect, it } from 'vitest';
// The filter is a plain script shared with public/sw.js; loading it puts the functions on globalThis.
import '../../../public/sw-filter.js';

interface Filter {
  classify: (url: string, origin: string, method: string, mode: string) => 'page' | 'asset' | 'ignore';
}
const filter = (globalThis as unknown as { forthrightSwFilter: Filter }).forthrightSwFilter;
const ORIGIN = 'https://forthrightapp.com';
const kind = (path: string, mode = 'no-cors', method = 'GET') => filter.classify(`${ORIGIN}${path}`, ORIGIN, method, mode);

describe('service worker request filter', () => {
  it('handles app pages and built files', () => {
    expect(kind('/', 'navigate')).toBe('page');
    expect(kind('/t/abc/events/e1', 'navigate')).toBe('page');
    expect(kind('/assets/index-3f9a.js')).toBe('asset');
    expect(kind('/assets/index-3f9a.css')).toBe('asset');
    expect(kind('/icon-192.png')).toBe('asset');
    expect(kind('/site.webmanifest')).toBe('asset');
  });

  it('never touches troop sites, calendar feeds or sign-in helper paths', () => {
    for (const path of ['/s/troop-9', '/s/troop-9/news', '/cal/abc123.ics', '/cal', '/__/auth/handler', '/__/firebase/init.json']) {
      expect(kind(path, 'navigate')).toBe('ignore');
      expect(kind(path)).toBe('ignore');
    }
  });

  it('still handles paths that merely start with the same letters', () => {
    expect(kind('/settings', 'navigate')).toBe('page');
    expect(kind('/calendar', 'navigate')).toBe('page');
  });

  it('never touches another host, such as Firestore, Cloud Functions, Storage or Google sign-in', () => {
    for (const url of [
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel',
      'https://us-central1-scout-app.cloudfunctions.net/post_announcement',
      'https://firebasestorage.googleapis.com/v0/b/x/o/photo.png',
      'https://accounts.google.com/o/oauth2/auth',
      'https://fonts.gstatic.com/s/zillaslab/font.woff2',
    ]) {
      expect(filter.classify(url, ORIGIN, 'GET', 'navigate')).toBe('ignore');
      expect(filter.classify(url, ORIGIN, 'GET', 'cors')).toBe('ignore');
    }
  });

  it('never touches anything but GET', () => {
    expect(kind('/assets/index-3f9a.js', 'cors', 'POST')).toBe('ignore');
    expect(kind('/', 'navigate', 'POST')).toBe('ignore');
  });

  it('leaves data requests and the worker itself alone', () => {
    expect(kind('/requirements/camping.json')).toBe('ignore');
    expect(kind('/sw.js')).toBe('ignore');
    expect(kind('/sw-filter.js')).toBe('ignore');
  });

  it('ignores addresses it cannot read', () => {
    expect(filter.classify('http://[bad', ORIGIN, 'GET', 'navigate')).toBe('ignore');
  });
});
