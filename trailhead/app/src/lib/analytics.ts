// Google Tag Manager, on the public marketing pages only (/, /features, /pilot) and only for visitors who are not
// signed in. It never runs in the app, on the privacy policy or on troop websites: the app holds children's
// information, and the privacy policy promises nothing in it is tracked. See the "Cookies" part of privacy.ts.
import { useEffect } from 'react';
import { useAuth } from './auth';

export const GTM_ID = 'GTM-NFFV3DQ5';
/** Only the live site: never staging, previews or tests, so they don't count as visits. */
export const ANALYTICS_HOSTS = ['forthrightapp.com', 'www.forthrightapp.com'];
const FLAG = '__forthrightTagManager';

type Win = Window & { dataLayer?: unknown[]; [FLAG]?: boolean };

/** Whether Tag Manager may load here and now. A Global Privacy Control signal turns it off. */
export function mayLoad(o: { host: string; signedIn: boolean; gpc: boolean }): boolean {
  return ANALYTICS_HOSTS.includes(o.host) && !o.signedIn && !o.gpc;
}

/** Add Google's Tag Manager snippet once. */
export function loadTagManager(win: Win = window as Win, doc: Document = document): void {
  if (win[FLAG]) {
    return;
  }
  win[FLAG] = true;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  doc.head.appendChild(script);
}

/** True if Tag Manager is running in this page. */
export function tagManagerLoaded(win: Win = window as Win): boolean {
  return Boolean(win[FLAG]);
}

/** A marketing page: load Tag Manager for a signed-out visitor on the live site. */
export function useMarketingAnalytics(): void {
  const { user, ready } = useAuth();
  useEffect(() => {
    const gpc = Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
    if (ready && mayLoad({ host: window.location.hostname, signedIn: Boolean(user), gpc })) {
      loadTagManager();
    }
  }, [ready, user]);
}

/** Any page that is not marketing: if Tag Manager came along from a marketing page (this is a single-page app),
 * load the page afresh without it, so nothing in the app is ever tracked. */
export function useNoAnalytics(): void {
  useEffect(() => {
    if (tagManagerLoaded()) {
      window.location.reload();
    }
  }, []);
}
