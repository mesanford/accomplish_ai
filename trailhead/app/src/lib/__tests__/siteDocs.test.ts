import { describe, expect, it } from 'vitest';
import { bannerShows, groupByMonth, monthLabel } from '../siteCalendar';
import {
  canBePublic,
  canOpen,
  categoryLabel,
  DOC,
  DOCX,
  docProblem,
  docStoragePath,
  fileKind,
  formatSize,
  groupByCategory,
  MAX_DOC_BYTES,
  safeFileName,
  titleFromFileName,
  visibilityChoices,
} from '../siteDocs';

describe('who can see a document', () => {
  it('lets leaders open everything and members open members and public documents', () => {
    expect(canOpen({ visibility: 'leaders' }, true)).toBe(true);
    expect(canOpen({ visibility: 'leaders' }, false)).toBe(false);
    expect(canOpen({ visibility: 'members' }, false)).toBe(true);
    expect(canOpen({ visibility: 'public' }, false)).toBe(true);
  });

  it('never offers public for medical forms or old Word files', () => {
    expect(visibilityChoices({ category: 'gear', contentType: 'application/pdf' })).toEqual(['public', 'members', 'leaders']);
    expect(visibilityChoices({ category: 'medical', contentType: 'application/pdf' })).toEqual(['members', 'leaders']);
    expect(visibilityChoices({ category: 'gear', contentType: DOC })).toEqual(['members', 'leaders']);
    expect(canBePublic({ category: 'gear', contentType: DOCX })).toBe(true);
    expect(canBePublic({ category: 'medical', contentType: DOCX })).toBe(false);
  });
});

describe('files', () => {
  it('accepts PDF, Word and images up to 20 MB', () => {
    for (const type of ['application/pdf', DOC, DOCX, 'image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(docProblem({ type, size: 1000 })).toBeNull();
    }
    expect(docProblem({ type: 'application/pdf', size: MAX_DOC_BYTES })).toBeNull();
  });

  it('refuses other types, empty files and big files', () => {
    expect(docProblem({ type: 'text/html', size: 10 })).toMatch(/PDF/);
    expect(docProblem({ type: 'application/zip', size: 10 })).toMatch(/PDF/);
    expect(docProblem({ type: '', size: 10 })).toMatch(/PDF/);
    expect(docProblem({ type: 'application/pdf', size: 0 })).toMatch(/empty/);
    expect(docProblem({ type: 'application/pdf', size: MAX_DOC_BYTES + 1 })).toMatch(/20 MB/);
  });

  it('makes safe file names and storage paths', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('Permission slip (2026).pdf')).toBe('Permission-slip-2026-.pdf');
    expect(safeFileName('???')).toBe('document');
    expect(safeFileName('x'.repeat(300))).toHaveLength(80);
    expect(docStoragePath('t1', 'abc', 'My File.pdf')).toBe('docs/t1/abc/My-File.pdf');
  });

  it('suggests a title from the file name', () => {
    expect(titleFromFileName('gear_list-2026.pdf')).toBe('gear list 2026');
  });

  it('describes files in plain words', () => {
    expect(fileKind('application/pdf')).toBe('PDF');
    expect(fileKind(DOCX)).toBe('Word');
    expect(fileKind('image/png')).toBe('Image');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatSize(null)).toBe('');
    expect(categoryLabel('medical')).toBe('Medical forms');
    expect(categoryLabel('nonsense')).toBe('Other');
  });

  it('groups by category in the usual order, sorted by title', () => {
    const groups = groupByCategory([
      { category: 'other', title: 'Zebra' },
      { category: 'gear', title: 'b list' },
      { category: 'permission', title: 'Camp' },
      { category: 'gear', title: 'A list' },
      { category: 'weird', title: 'Odd' },
    ]);
    expect(groups.map(([label]) => label)).toEqual(['Permission slips', 'Gear lists', 'Other']);
    expect(groups[1][1].map((d) => d.title)).toEqual(['A list', 'b list']);
    expect(groups[2][1].map((d) => d.title)).toEqual(['Odd', 'Zebra']);
  });
});

describe('calendar', () => {
  it('groups events by month in date order', () => {
    const groups = groupByMonth([
      { title: 'B', start: '2026-12-02' },
      { title: 'A', start: '2026-11-20' },
      { title: 'C', start: '2026-11-25', place: 'Camp' },
      { title: 'Bad', start: 'soon' },
    ]);
    expect(groups.map(([key]) => key)).toEqual(['2026-11', '2026-12']);
    expect(groups[0][1].map((e) => e.title)).toEqual(['A', 'C']);
    expect(monthLabel('2026-11')).toBe('November 2026');
  });

  it('shows the banner until its end date has passed', () => {
    expect(bannerShows({ text: 'Fees due', endDate: '2026-10-14' }, '2026-10-14')).toBe(true);
    expect(bannerShows({ text: 'Fees due', endDate: '2026-10-13' }, '2026-10-14')).toBe(false);
    expect(bannerShows({ text: 'Always', endDate: null }, '2026-10-14')).toBe(true);
    expect(bannerShows({ text: '  ' }, '2026-10-14')).toBe(false);
    expect(bannerShows(null, '2026-10-14')).toBe(false);
  });
});
