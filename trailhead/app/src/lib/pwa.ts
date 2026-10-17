import { useSyncExternalStore } from 'react';
import { installHint, type InstallHint } from './installHint';
import { storage } from './storage';

/** Installing the app and keeping it current. The service worker is public/sw.js; what it may handle is decided in
 * public/sw-filter.js. It only registers in a production build (or with VITE_ENABLE_SW=true), so development never
 * serves stale code. */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** A new copy of the app is installed and waiting for the person to reload. */
  updateReady: boolean;
  /** The service worker is registered, so push can work. */
  registration: ServiceWorkerRegistration | null;
  prompt: InstallPromptEvent | null;
  dismissed: boolean;
}

const DISMISSED_KEY = 'forthright.installDismissed';
const CHECK_EVERY_MS = 60 * 60 * 1000;
let state: PwaState = { updateReady: false, registration: null, prompt: null, dismissed: storage.get(DISMISSED_KEY) === '1' };
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const swEnabled = (): boolean =>
  'serviceWorker' in navigator && (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === 'true');

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function watch(registration: ServiceWorkerRegistration): void {
  // A copy that installed while this page ran is waiting only if an older one is in charge (otherwise it is the first).
  const waiting = () => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      set({ updateReady: true });
    }
  };
  waiting();
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', waiting);
  });
}

/** Call once at startup. Safe to call again. */
export function initPwa(): void {
  if (started) {
    return;
  }
  started = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // keep the prompt for our own button
    set({ prompt: event as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ prompt: null }));
  if (!swEnabled()) {
    return;
  }
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      set({ registration });
      watch(registration);
      // Long-lived tabs and installed apps rarely reload, so look for a new release now and then.
      const check = () => registration.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      window.setInterval(check, CHECK_EVERY_MS);
    })
    .catch(() => undefined); // the app works without a worker
}

/** Switch to the waiting copy and reload. The old copy's caches are removed when the new one takes over. */
export function applyUpdate(): void {
  const waiting = state.registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function dismissInstall(): void {
  storage.set(DISMISSED_KEY, '1');
  set({ dismissed: true });
}

export async function promptInstall(): Promise<void> {
  const prompt = state.prompt;
  if (!prompt) {
    return;
  }
  set({ prompt: null }); // the browser allows each prompt once
  await prompt.prompt();
  await prompt.userChoice;
}

export const usePwa = (): PwaState => useSyncExternalStore(subscribe, () => state);

export function useInstallHint(): InstallHint {
  const pwa = usePwa();
  return installHint({
    standalone: isStandalone(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    hasPrompt: pwa.prompt !== null,
    dismissed: pwa.dismissed,
  });
}
