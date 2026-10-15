import { describe, expect, it } from 'vitest';
import { COLOR_PRESETS, contrast, DEFAULT_COLOR, inkOn, paragraphs, safeUrl, siteColors, validColor } from '../siteTheme';

describe('site theme', () => {
  it('falls back to the default for bad colors', () => {
    expect(validColor('red')).toBe(DEFAULT_COLOR);
    expect(validColor(null)).toBe(DEFAULT_COLOR);
    expect(validColor('#ABCDEF')).toBe('#abcdef');
  });

  it('picks readable ink for light and dark fills', () => {
    expect(inkOn('#ffeb3b')).toBe('#141711');
    expect(inkOn('#0b2a5b')).toBe('#ffffff');
  });

  it('keeps accent text readable on both surfaces for any color', () => {
    for (const color of ['#ffeb3b', '#0b2a5b', '#4f6a2e', '#ff0000', '#000000', '#ffffff']) {
      const c = siteColors(color);
      expect(contrast(c.textLight, '#fffdf7')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.textDark, '#20241c')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.fill, c.ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('offers valid preset colors that stay readable', () => {
    expect(COLOR_PRESETS[0].color).toBe(DEFAULT_COLOR);
    for (const { color } of COLOR_PRESETS) {
      expect(validColor(color)).toBe(color);
      const c = siteColors(color);
      expect(contrast(c.fill, c.ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('only allows web links', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });

  it('splits text into paragraphs', () => {
    expect(paragraphs('One\n\n\nTwo\nstill two\n\n')).toEqual(['One', 'Two\nstill two']);
  });
});
