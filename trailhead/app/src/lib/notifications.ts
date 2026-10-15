/** Email notifications about blue cards and a person's Scouts. On unless the person turned them off. */
export const EMAIL_NOTIFICATIONS_LABEL = "Email me about blue cards and my Scouts' advancement";

export const emailNotificationsOn = (user: { emailNotifications?: boolean } | null | undefined): boolean =>
  user?.emailNotifications !== false;
