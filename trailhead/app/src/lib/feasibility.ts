import type { Feasibility } from './types';

/** Issues with no message repeated: the same sentence is shown once. */
export function uniqueIssues(issues: Feasibility['issues']): Feasibility['issues'] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.message)) {
      return false;
    }
    seen.add(i.message);
    return true;
  });
}
