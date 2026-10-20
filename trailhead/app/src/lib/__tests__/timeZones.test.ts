import { describe, expect, it } from 'vitest';
import { browserZone, DEFAULT_ZONE, ZONES, zoneLabel } from '../timeZones';

describe('time zones', () => {
  it('uses the browser zone when a troop can pick it, else Central', () => {
    expect(browserZone('America/Los_Angeles')).toBe('America/Los_Angeles');
    expect(browserZone('America/Indiana/Indianapolis')).toBe(DEFAULT_ZONE);
    expect(browserZone('')).toBe(DEFAULT_ZONE);
  });

  it('names a zone, Central when unset', () => {
    expect(zoneLabel('Pacific/Honolulu')).toBe('Hawaii');
    expect(zoneLabel(undefined)).toBe('Central');
  });

  it('lists US zones first', () => {
    expect(ZONES[0][0]).toBe('America/New_York');
  });
});
