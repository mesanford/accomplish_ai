/** Email notifications about blue cards and a person's Scouts. On unless the person turned them off. */
export const EMAIL_NOTIFICATIONS_LABEL = "Email me about blue cards and my Scouts' advancement";

export const emailNotificationsOn = (user: { emailNotifications?: boolean } | null | undefined): boolean =>
  user?.emailNotifications !== false;

/** The weekly family digest, Sunday evening. On unless the person turned it off. */
export const DIGEST_EMAIL_LABEL = 'Email me a weekly summary on Sunday evening: the coming week, deadlines and permission slips';

export const digestEmailsOn = (user: { emailDigest?: boolean } | null | undefined): boolean =>
  user?.emailDigest !== false;
