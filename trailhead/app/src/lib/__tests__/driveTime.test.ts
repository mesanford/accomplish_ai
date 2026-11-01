import { describe, expect, it } from 'vitest';
import { isMapsLink } from '../driveTime';

describe('isMapsLink', () => {
  it('accepts Google Maps pages and short links over https', () => {
    expect(isMapsLink('https://www.google.com/maps/place/Pine+Lake/@44.9,-93.1,12z')).toBe(true);
    expect(isMapsLink(' https://maps.app.goo.gl/AbC123 ')).toBe(true);
    expect(isMapsLink('https://maps.google.com/maps?q=44.5,-93.25')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isMapsLink('http://www.google.com/maps/@44.9,-93.1,12z')).toBe(false);
    expect(isMapsLink('https://www.google.com/search?q=camp')).toBe(false);
    expect(isMapsLink('https://www.google.com.evil.example/maps/x')).toBe(false);
    expect(isMapsLink('javascript:alert(1)')).toBe(false);
    expect(isMapsLink('not a link')).toBe(false);
  });
});
