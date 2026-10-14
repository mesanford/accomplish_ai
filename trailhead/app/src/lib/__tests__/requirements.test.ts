import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRequirementsCache,
  findRequirement,
  flatten,
  loadRequirements,
  normalizeReqId,
  officialRequirementsUrl,
  type RequirementsDoc,
  statusLookup,
} from '../requirements';

const leaf = (id: string, label: string, text = 'Do it.') => ({ id, label, text, resources: [], children: [] });

const DOC: RequirementsDoc = {
  awardId: 'camping',
  name: 'Camping',
  kind: 'merit_badge',
  sourceUrl: 'https://www.scouting.org/merit-badges/camping/',
  fetchedAt: '2026-10-14',
  requirements: [
    leaf('1', '1.', 'Explain the rules.'),
    {
      ...leaf('9', '9.', 'Do the following:'),
      children: [
        { ...leaf('9a', '(a)'), children: [leaf('9a(1)', '(1)', 'Plan a menu.'), leaf('9a(2)', '(2)')] },
        leaf('9b', '(b)'),
      ],
    },
  ],
};

describe('normalizeReqId', () => {
  it('ignores case, spaces, dots and parentheses', () => {
    for (const typed of ['4B', '4b.', '4(b)', ' 4 b ', '(4)(b)']) {
      expect(normalizeReqId(typed)).toBe('4b');
    }
    expect(normalizeReqId('9a1')).toBe(normalizeReqId('9a(1)'));
  });
});

describe('flatten', () => {
  it('lists every requirement in order with its depth', () => {
    expect(flatten(DOC.requirements).map((r) => [r.id, r.depth])).toEqual([
      ['1', 0],
      ['9', 0],
      ['9a', 1],
      ['9a(1)', 2],
      ['9a(2)', 2],
      ['9b', 1],
    ]);
  });
});

describe('findRequirement', () => {
  it('matches typed spellings to the official id', () => {
    expect(findRequirement(DOC, '9B')?.id).toBe('9b');
    expect(findRequirement(DOC, '9a1')?.text).toBe('Plan a menu.');
    expect(findRequirement(DOC, '9(a)(2)')?.id).toBe('9a(2)');
    expect(findRequirement(DOC, '1.')?.id).toBe('1');
  });

  it('returns nothing for unknown ids, empty input or a missing doc', () => {
    expect(findRequirement(DOC, '12')).toBeUndefined();
    expect(findRequirement(DOC, ' ')).toBeUndefined();
    expect(findRequirement(null, '1')).toBeUndefined();
  });
});

describe('statusLookup', () => {
  it('keys statuses by normalized id', () => {
    const lookup = statusLookup({ '4B': { status: 'signed' }, '9a1': { status: 'ready' } });
    expect(lookup[normalizeReqId('4b')]).toBe('signed');
    expect(lookup[normalizeReqId('9a(1)')]).toBe('ready');
  });
});

describe('officialRequirementsUrl', () => {
  it('uses the badge page, or the advancement page for ranks', () => {
    expect(officialRequirementsUrl('camping')).toContain('scouting.org');
    expect(officialRequirementsUrl('tenderfoot')).toContain('advancement-and-awards');
  });
});

describe('loadRequirements', () => {
  beforeEach(() => clearRequirementsCache());
  afterEach(() => vi.unstubAllGlobals());

  it('fetches a file once and caches it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(DOC) });
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadRequirements('camping'))?.name).toBe('Camping');
    await loadRequirements('camping');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/requirements/camping.json');
  });

  it('returns null for a 404, an HTML page or a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await loadRequirements('missing')).toBeNull();
    clearRequirementsCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError('html')) }));
    expect(await loadRequirements('missing')).toBeNull();
    clearRequirementsCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadRequirements('missing')).toBeNull();
  });

  it('does not remember a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: () => Promise.resolve(DOC) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadRequirements('camping')).toBeNull();
    expect((await loadRequirements('camping'))?.awardId).toBe('camping');
  });

  it('never fetches troop-made awards', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadRequirements('custom-trail')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('isSignable', () => {
  it('treats requirements with parts as headings', async () => {
    const { isSignable } = await import('../requirements');
    const leaf = { id: '1a', label: '(a)', text: 'x', resources: [], children: [] };
    expect(isSignable(leaf)).toBe(true);
    expect(isSignable({ ...leaf, id: '1', children: [leaf] })).toBe(false);
  });
});
