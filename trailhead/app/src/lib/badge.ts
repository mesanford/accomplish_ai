/** Shows how many announcements are unread on the installed app's icon, where the browser supports the Badging API.
 * Everywhere else this does nothing. The hook that counts them is in useUnreadBadge.ts. */

type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export function setBadge(count: number): void {
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0 && nav.setAppBadge) {
      nav.setAppBadge(count).catch(() => undefined);
    } else if (nav.clearAppBadge) {
      nav.clearAppBadge().catch(() => undefined);
    }
  } catch {
    // Badging is a nicety; ignore any failure.
  }
}

export const clearBadge = (): void => setBadge(0);
