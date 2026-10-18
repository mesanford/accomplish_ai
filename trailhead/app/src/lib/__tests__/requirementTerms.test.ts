import { describe, expect, it } from 'vitest';
import { HELP } from '../help';
import { requirementTerms } from '../requirementTerms';

describe('requirementTerms', () => {
  it('finds each term regardless of capitalization', () => {
    expect(requirementTerms('Participate in a Scoutmaster Conference.')).toEqual(['scoutmasterConference']);
    expect(requirementTerms('Complete a board of review.')).toEqual(['boardOfReview']);
    expect(requirementTerms('Serve in a POSITION OF RESPONSIBILITY for 4 months.')).toEqual(['positionOfResponsibility']);
  });

  it('returns each topic once, even when a term repeats', () => {
    expect(requirementTerms('Board of review, then another board of review.')).toEqual(['boardOfReview']);
  });

  it('finds several different terms in one requirement', () => {
    const topics = requirementTerms('After a position of responsibility and a scoutmaster conference, a board of review.');
    expect(topics).toEqual(['boardOfReview', 'scoutmasterConference', 'positionOfResponsibility']);
  });

  it('matches plural wording', () => {
    expect(requirementTerms('Serve in positions of responsibility.')).toEqual(['positionOfResponsibility']);
  });

  it('returns nothing for other text', () => {
    expect(requirementTerms('Tie a square knot.')).toEqual([]);
    expect(requirementTerms('')).toEqual([]);
  });

  it('only returns topics that exist in Help', () => {
    for (const topic of requirementTerms('board of review scoutmaster conference position of responsibility')) {
      expect(HELP[topic]).toBeDefined();
    }
  });
});
