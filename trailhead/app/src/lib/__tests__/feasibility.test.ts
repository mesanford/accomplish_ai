import { describe, expect, it } from 'vitest';
import { uniqueIssues } from '../feasibility';

const issue = (code: string, message: string) => ({ code, severity: 'warning' as const, message });

describe('uniqueIssues', () => {
  it('shows a repeated sentence once', () => {
    const note = 'The date of the current rank is missing, so timing is counted from today.';
    const out = uniqueIssues([issue('missing_rank_date', note), issue('other', 'Something else.'), issue('missing_rank_date', note)]);
    expect(out.map((i) => i.message)).toEqual([note, 'Something else.']);
  });
});
