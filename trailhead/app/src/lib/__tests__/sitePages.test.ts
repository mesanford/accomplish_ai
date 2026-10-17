import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PageBlocks, Spans } from '../../components/site/PageBlocks';
import {
  type DraftPage,
  formatInline,
  listToText,
  move,
  newPage,
  PAGE_LIMITS,
  pageAddress,
  pageProblem,
  pageSlug,
  parseInline,
  type PublicBlock,
  safeHref,
  textToList,
} from '../sitePages';
import { normalizeDraft } from '../site';

const page = (over: Partial<DraftPage> = {}): DraftPage => ({ id: 'p1', title: 'High adventure', slug: 'high-adventure', blocks: [], ...over });

describe('safe links', () => {
  it.each(['https://example.com', 'http://example.com/a?b=1#c', 'mailto:sm@example.com'])('keeps %s', (url) => {
    expect(safeHref(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'file:///etc/passwd',
    'ftp://example.com',
    '//example.com',
    '/relative',
    'example.com',
    'https://',
    'mailto:nobody',
    'https://exa mple.com',
    'java\tscript:alert(1)',
    `https://${'a'.repeat(600)}`,
    '',
    null,
    undefined,
  ])('drops %s', (url) => {
    expect(safeHref(url as string | null | undefined)).toBeNull();
  });
});

describe('text with links', () => {
  it('turns [words](address) into a link span', () => {
    expect(parseInline('Read the [guide](https://example.com/g) first.')).toEqual([
      { text: 'Read the ' },
      { text: 'guide', href: 'https://example.com/g' },
      { text: ' first.' },
    ]);
  });

  it('leaves an unsafe link as plain text instead of making a link', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ text: '[click](javascript:alert(1))' }]);
    expect(parseInline('[mail](mailto:a@b.org)')).toEqual([{ text: 'mail', href: 'mailto:a@b.org' }]);
  });

  it('round-trips, so typing never loses text', () => {
    for (const text of ['', 'plain', 'a [b](https://c.org) d', '[x](https://x.org)[y](https://y.org)', 'line one\nline two', 'unclosed [x](https://']) {
      expect(formatInline(parseInline(text))).toBe(text);
    }
  });

  it('keeps blank lines in lists while typing so a new line can start', () => {
    expect(listToText(textToList('Tent\n'))).toBe('Tent\n');
    expect(textToList('Tent\nPack')).toEqual([[{ text: 'Tent' }], [{ text: 'Pack' }]]);
  });
});

describe('rendering', () => {
  it('shows page text as text, never as markup', () => {
    const blocks: PublicBlock[] = [
      { type: 'heading', text: '<img src=x onerror=alert(1)>' },
      { type: 'paragraph', inline: [{ text: '<script>alert(1)</script>' }] },
      { type: 'list', items: [[{ text: '<b>bold</b>' }]] },
    ];
    const html = renderToStaticMarkup(createElement(PageBlocks, { blocks }));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('links only http, https and mailto addresses, and opens web links safely', () => {
    const html = renderToStaticMarkup(
      createElement(Spans, {
        spans: [
          { text: 'good', href: 'https://example.com' },
          { text: 'mail', href: 'mailto:a@b.org' },
          { text: 'bad', href: 'javascript:alert(1)' },
          { text: 'worse', href: 'data:text/html,x' },
        ],
      }),
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:a@b.org"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:');
    expect(html).toContain('<span>bad</span>');
  });

  it('shows images only from web addresses', () => {
    const html = renderToStaticMarkup(
      createElement(PageBlocks, {
        blocks: [
          { type: 'image', url: 'https://files.example.com/a.jpg', alt: 'Lake' },
          { type: 'image', url: 'javascript:alert(1)', alt: 'Bad' },
        ],
      }),
    );
    expect(html).toContain('src="https://files.example.com/a.jpg"');
    expect(html).toContain('alt="Lake"');
    expect(html).not.toContain('javascript:');
  });
});

describe('page rules', () => {
  it('accepts a normal page', () => {
    expect(pageProblem(page(), [page()])).toBeNull();
  });

  it('asks for a title and a good address', () => {
    expect(pageProblem(page({ title: ' ' }), [])).toMatch(/title/);
    expect(pageProblem(page({ slug: 'High Adventure' }), [])).toMatch(/lowercase/);
    expect(pageProblem(page({ slug: '-x' }), [])).toMatch(/start or end/);
    expect(pageProblem(page({ slug: '' }), [])).toMatch(/lowercase/);
    expect(pageProblem(page({ slug: 'a'.repeat(41) }), [])).toMatch(/lowercase/);
  });

  it('keeps the addresses the site already uses', () => {
    for (const slug of ['calendar', 'documents', 'home']) {
      expect(pageProblem(page({ slug }), [])).toMatch(/used by the site/);
    }
  });

  it('refuses two pages with one address', () => {
    const a = page();
    const b = page({ id: 'p2', title: 'Again' });
    expect(pageProblem(b, [a, b])).toMatch(/Another page/);
  });

  it('limits blocks and images', () => {
    const heading = { type: 'heading' as const, text: 'x' };
    expect(pageProblem(page({ blocks: Array(PAGE_LIMITS.blocks + 1).fill(heading) }), [])).toMatch(/blocks/);
    const image = { type: 'image' as const, path: 'p', alt: '', scoutIds: [], noScoutsShown: true };
    expect(pageProblem(page({ blocks: Array(PAGE_LIMITS.images + 1).fill(image) }), [])).toMatch(/images/);
  });
});

describe('page helpers', () => {
  it('makes addresses from titles', () => {
    expect(pageSlug('High Adventure!')).toBe('high-adventure');
    expect(pageSlug('New families & friends')).toBe('new-families-friends');
    expect(pageAddress('https://x.org', 'troop-1', 'eagles')).toBe('https://x.org/s/troop-1/eagles');
  });

  it('adds new pages with unused names and ids', () => {
    const first = newPage([], 1);
    const second = newPage([first], 2);
    expect(first.slug).toBe('page-1');
    expect(second.slug).toBe('page-2');
    expect(first.id).not.toBe(second.id);
    expect(newPage([{ ...first, slug: 'page-2' }], 3).slug).toBe('page-3');
  });

  it('reorders without losing anything', () => {
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(move(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });

  it('opens older drafts with no pages, announcement or layout', () => {
    const draft = normalizeDraft({ slug: 'troop-1', about: 'Hi' }, { name: 'Troop 1', unitNumber: '1' } as never);
    expect(draft.pages).toEqual([]);
    expect(draft.announcement).toEqual({ text: '', endDate: null });
    expect(draft.coverLayout).toBe('band');
  });
});
