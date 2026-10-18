import type { HelpKey } from './help';

/** Scouting terms that appear in requirement text, with the Help topic that explains each one. */
const TERMS: { phrase: RegExp; topic: HelpKey }[] = [
  { phrase: /board of reviews?/, topic: 'boardOfReview' },
  { phrase: /scoutmaster conferences?/, topic: 'scoutmasterConference' },
  { phrase: /positions? of responsibility/, topic: 'positionOfResponsibility' },
];

/** Help topics for the terms found in a requirement's text (any capitalization), once each, in the order listed. */
export function requirementTerms(text: string): HelpKey[] {
  const lower = text.toLowerCase();
  return TERMS.filter((t) => t.phrase.test(lower)).map((t) => t.topic);
}
