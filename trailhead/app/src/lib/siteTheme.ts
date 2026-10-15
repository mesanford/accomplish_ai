/** Turns a troop's chosen color into text and background colors that stay readable in light and dark. */

export const DEFAULT_COLOR = '#4f6a2e';

/** Suggested troop colors: Forthright green and the Topo Map palette from the design system. */
export const COLOR_PRESETS: { name: string; color: string }[] = [
  { name: 'Forthright green', color: DEFAULT_COLOR },
  { name: 'Contour brown', color: '#7a4f24' },
  { name: 'Water blue', color: '#2f6e9e' },
  { name: 'Woodland', color: '#d3e3bc' },
];
const LIGHT_SURFACE = '#fffdf7';
const DARK_SURFACE = '#20241c';

function parse(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function validColor(color: string | undefined | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : DEFAULT_COLOR;
}

export function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on this color. */
export function inkOn(hex: string): string {
  return contrast(hex, '#ffffff') >= contrast(hex, '#141711') ? '#ffffff' : '#141711';
}

function mix(hex: string, target: string, amount: number): string {
  const from = parse(hex);
  const to = parse(target);
  return toHex(from.map((v, i) => v + (to[i] - v) * amount) as [number, number, number]);
}

/** Moves the color toward black or white until it reaches `min` contrast against `surface`. */
export function readableOn(hex: string, surface: string, toward: string, min = 4.5): string {
  let color = hex;
  for (let step = 0; step < 20 && contrast(color, surface) < min; step += 1) {
    color = mix(color, toward, 0.1 + step * 0.02);
  }
  return color;
}

export interface SiteColors {
  fill: string;
  ink: string;
  textLight: string;
  textDark: string;
}

export function siteColors(color: string | undefined | null): SiteColors {
  const fill = validColor(color);
  return {
    fill,
    ink: inkOn(fill),
    textLight: readableOn(fill, LIGHT_SURFACE, '#000000'),
    textDark: readableOn(fill, DARK_SURFACE, '#ffffff'),
  };
}

/** Only web addresses are linked or loaded; anything else (such as javascript:) is dropped. */
export function safeUrl(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function paragraphs(text: string | undefined | null): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
