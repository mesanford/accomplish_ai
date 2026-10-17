import { describe, expect, it } from 'vitest';
import { installHint, isIos, type PushEnv, pushState } from '../installHint';

const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1';
const base = { standalone: false, userAgent: CHROME, hasPrompt: false };

describe('installHint', () => {
  it('says nothing once the app is installed', () => {
    expect(installHint({ ...base, standalone: true, hasPrompt: true })).toBe('installed');
  });

  it('offers the browser prompt when there is one', () => {
    expect(installHint({ ...base, hasPrompt: true })).toBe('prompt');
  });

  it('gives iPhone and iPad the Share steps, since they have no prompt', () => {
    expect(installHint({ ...base, userAgent: IPHONE })).toBe('ios');
    expect(installHint({ ...base, userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios');
  });

  it('shows nothing on a desktop Mac or an unsupported browser', () => {
    expect(installHint({ ...base, userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('none');
    expect(installHint(base)).toBe('none');
  });

  it('respects Not now', () => {
    expect(installHint({ ...base, hasPrompt: true, dismissed: true })).toBe('none');
    expect(installHint({ ...base, userAgent: IPHONE, dismissed: true })).toBe('none');
  });

  it('recognises iOS devices', () => {
    expect(isIos(IPHONE)).toBe(true);
    expect(isIos(CHROME)).toBe(false);
  });
});

describe('pushState', () => {
  const env: PushEnv = { hasKey: true, supported: true, ios: false, standalone: false, permission: 'default', registered: false };

  it('is hidden with no key or no browser support', () => {
    expect(pushState({ ...env, hasKey: false })).toBe('hidden');
    expect(pushState({ ...env, supported: false })).toBe('hidden');
  });

  it('asks iPhone users to install first, because iOS only pushes to the installed app', () => {
    expect(pushState({ ...env, ios: true })).toBe('needs-install');
    expect(pushState({ ...env, ios: true, standalone: true })).toBe('off');
  });

  it('reports a blocked permission, an off device and an on device', () => {
    expect(pushState({ ...env, permission: 'denied' })).toBe('blocked');
    expect(pushState(env)).toBe('off');
    expect(pushState({ ...env, permission: 'granted' })).toBe('off'); // allowed, but this device is not registered
    expect(pushState({ ...env, permission: 'granted', registered: true })).toBe('on');
  });
});
