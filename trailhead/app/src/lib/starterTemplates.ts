import type { TemplateItem } from './types';

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  goalAwardId: string;
  items: TemplateItem[];
}

// [award id, weeks until it starts, weeks it takes]. Lengths follow each badge's typical time.
// Personal Fitness (12 weeks), Personal Management (13 weeks) and Family Life (90 days) get
// a little more than their minimum tracking time.
type Row = [string, number, number];

function rows(list: Row[]): TemplateItem[] {
  return list.map(([awardId, start, length]) => ({
    awardId,
    startOffsetDays: start * 7,
    durationDays: length * 7,
  }));
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'starter-eagle-required',
    name: 'Eagle-required badges over about 2.5 years',
    description: 'Every Eagle-required badge, with one badge from each choice group, spread out so only a few run at once.',
    goalAwardId: 'eagle',
    items: rows([
      ['first-aid', 0, 6],
      ['camping', 0, 78],
      ['swimming', 6, 4],
      ['personal-fitness', 10, 13],
      ['personal-management', 24, 14],
      ['emergency-preparedness', 38, 8],
      ['cooking', 48, 16],
      ['family-life', 66, 14],
      ['communication', 80, 8],
      ['environmental-science', 90, 8],
      ['citizenship-in-the-community', 100, 8],
      ['citizenship-in-the-nation', 110, 6],
      ['citizenship-in-the-world', 118, 6],
    ]),
  },
  {
    id: 'starter-first-summer',
    name: 'First summer at camp',
    description: 'Badges that fit a week of summer camp: Swimming, First Aid and Environmental Science, plus Camping started.',
    goalAwardId: 'first-class',
    items: rows([
      ['swimming', 0, 4],
      ['first-aid', 0, 6],
      ['environmental-science', 2, 6],
      ['camping', 0, 26],
    ]),
  },
  {
    id: 'starter-star-year',
    name: 'Star in about a year',
    description: 'Six badges over a year, mostly Eagle-required, aimed at Star rank.',
    goalAwardId: 'star',
    items: rows([
      ['first-aid', 0, 6],
      ['camping', 0, 52],
      ['swimming', 6, 4],
      ['emergency-preparedness', 12, 8],
      ['environmental-science', 22, 8],
      ['cooking', 32, 16],
    ]),
  },
];
