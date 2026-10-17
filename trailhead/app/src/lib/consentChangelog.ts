/**
 * What changed in the parent notice, in plain sentences, keyed by the version that made the change.
 * Add an entry here whenever you bump CONSENT_NOTICE_VERSION (a test fails if you forget). The first version,
 * 2026-10-15, is the baseline and has no entry: nobody agreed to anything older.
 */
export const CONSENT_CHANGELOG: Record<string, string[]> = {
  '2026-10-15.2': ['The service is now called Forthright.'],
  '2026-10-15.3': [
    'The notice now says in plain words what we keep about your Scout, who sees it, who helps us run Forthright, and what choices you have.',
  ],
  '2026-10-16.1': [
    'Scout accounts: the troop treasurer can record fundraiser credit, charges and payments for your Scout. Only the treasurer, Scoutmaster, advancement chair, you and your Scout (if 13 or older) see them.',
    'Health notes: you can add a health or emergency note when you sign your Scout up for an event. Only leaders see health notes.',
  ],
  '2026-10-17.1': [
    'Patrols: we keep which patrol your Scout is in.',
    "Activity log: we keep your Scout's camping nights, service hours and hiking miles.",
    'Equipment: we keep a record of the troop gear your Scout borrows.',
  ],
};
