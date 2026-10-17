import { app } from './firebase';
import { type PushEnv, pushState, type PushState, isIos } from './installHint';
import { isStandalone } from './pwa';
import { storage } from './storage';
import { registerPushDevice, removePushDevice } from './api';

/** Push notifications on this device, with Firebase Cloud Messaging. Off unless the project has a web push key
 * (VITE_FCM_VAPID_KEY; Firebase console > Project settings > Cloud Messaging > Web Push certificates). The device's
 * token is saved on the server by a function; the browser keeps a copy only to be able to remove it again. */

export const vapidKey: string = (import.meta.env.VITE_FCM_VAPID_KEY as string | undefined) ?? '';
export const pushConfigured = vapidKey !== '';
const TOKEN_KEY = 'forthright.pushToken';

async function messagingApi() {
  return import('firebase/messaging');
}

/** Whether this browser can do push at all, from facts the browser reports. */
export async function browserSupportsPush(): Promise<boolean> {
  if (!pushConfigured || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false;
  }
  return (await messagingApi()).isSupported().catch(() => false);
}

export async function readPushState(registered: boolean): Promise<PushState> {
  const supported = (await browserSupportsPush()) && (await navigator.serviceWorker.getRegistration()) !== undefined;
  const env: PushEnv = {
    hasKey: pushConfigured,
    supported,
    ios: isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    standalone: isStandalone(),
    permission: 'Notification' in window ? Notification.permission : 'default',
    registered,
  };
  return pushState(env);
}

export const deviceHasToken = (): boolean => storage.get(TOKEN_KEY) !== null;

/** Ask permission, get this device's token and save it on the server. Throws a message a person can read. */
export async function enablePush(): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('Notifications are blocked for Forthright in this browser. Allow them in the browser settings, then try again.');
  }
  const registration = await navigator.serviceWorker.ready;
  const { getMessaging, getToken } = await messagingApi();
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  if (!token) {
    throw new Error('This browser did not give Forthright a notification address. Try again in a moment.');
  }
  await registerPushDevice(token);
  storage.set(TOKEN_KEY, token);
}

/** Stop pushes to this device: remove it from the server, then drop the browser's subscription. */
export async function disablePush(): Promise<void> {
  const token = storage.get(TOKEN_KEY);
  if (token) {
    await removePushDevice(token);
  }
  storage.remove(TOKEN_KEY);
  try {
    const { deleteToken, getMessaging } = await messagingApi();
    await deleteToken(getMessaging(app));
  } catch {
    // The server no longer sends to it, so a leftover subscription does no harm.
  }
}

/** Part of signing out: the next person on this device must not receive this person's notifications. Never throws and
 * never waits long, so signing out is not held up by a poor connection. */
export async function dropDeviceOnSignOut(): Promise<void> {
  if (!pushConfigured || !deviceHasToken()) {
    return;
  }
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 3000));
  await Promise.race([disablePush().catch(() => storage.remove(TOKEN_KEY)), timeout]);
  storage.remove(TOKEN_KEY);
}
