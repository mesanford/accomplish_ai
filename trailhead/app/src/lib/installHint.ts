/** What to say about installing Forthright on this device, and whether push notifications can be offered. Pure
 * functions over facts read from the browser (see pwa.ts), so they can be tested without one. */

export type InstallHint = 'installed' | 'prompt' | 'ios' | 'none';

export interface InstallEnv {
  /** Already running as an installed app (home-screen icon). */
  standalone: boolean;
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** The browser offered an install prompt (Chrome and Edge on Android and desktop). */
  hasPrompt: boolean;
  /** The person tapped "Not now" before. */
  dismissed?: boolean;
}

export function isIos(userAgent: string, platform = '', maxTouchPoints = 0): boolean {
  // iPadOS 13 and later reports itself as a Mac, with a touch screen.
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function installHint(env: InstallEnv): InstallHint {
  if (env.standalone) {
    return 'installed';
  }
  if (env.dismissed) {
    return 'none';
  }
  if (env.hasPrompt) {
    return 'prompt';
  }
  return isIos(env.userAgent, env.platform, env.maxTouchPoints) ? 'ios' : 'none';
}

export const IOS_INSTALL_STEPS = 'Tap the Share button, then choose Add to Home Screen.';

export type PushState =
  /** No web push key is set, or this browser cannot do push: show nothing. */
  | 'hidden'
  /** iPhone and iPad only allow push from the installed app. */
  | 'needs-install'
  /** The person said no in the browser; only they can change that in settings. */
  | 'blocked'
  | 'off'
  | 'on';

export interface PushEnv {
  hasKey: boolean;
  /** Service worker, Push API and Notification are all present, and the worker is registered. */
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: 'default' | 'granted' | 'denied';
  /** This device has a saved token on the server. */
  registered: boolean;
}

export function pushState(env: PushEnv): PushState {
  if (!env.hasKey) {
    return 'hidden';
  }
  if (env.ios && !env.standalone) {
    return 'needs-install';
  }
  if (!env.supported) {
    return 'hidden';
  }
  if (env.permission === 'denied') {
    return 'blocked';
  }
  return env.permission === 'granted' && env.registered ? 'on' : 'off';
}
