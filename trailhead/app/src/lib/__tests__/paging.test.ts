import { describe, expect, it } from 'vitest';
import { firstPage } from '../paging';

describe('firstPage', () => {
  it('cuts a long list and counts the rest', () => {
    const page = firstPage([1, 2, 3, 4, 5], 2);
    expect(page.items).toEqual([1, 2]);
    expect(page.remaining).toBe(3);
  });

  it('shows a short list whole', () => {
    expect(firstPage([1, 2], 30)).toEqual({ items: [1, 2], remaining: 0 });
    expect(firstPage([], 30)).toEqual({ items: [], remaining: 0 });
  });
});
