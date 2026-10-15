import { describe, expect, it } from 'vitest';
import { EMAIL_NOTIFICATIONS_LABEL, emailNotificationsOn } from '../notifications';

describe('emailNotificationsOn', () => {
  it('is on by default, before the person has chosen', () => {
    expect(emailNotificationsOn(null)).toBe(true);
    expect(emailNotificationsOn(undefined)).toBe(true);
    expect(emailNotificationsOn({})).toBe(true);
  });

  it('follows a saved choice', () => {
    expect(emailNotificationsOn({ emailNotifications: true })).toBe(true);
    expect(emailNotificationsOn({ emailNotifications: false })).toBe(false);
  });

  it('labels the checkbox in plain words', () => {
    expect(EMAIL_NOTIFICATIONS_LABEL).toBe("Email me about blue cards and my Scouts' advancement");
  });
});
