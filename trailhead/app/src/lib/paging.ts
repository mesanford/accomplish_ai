export const PAGE_SIZE = 30;

/** The first `limit` items, and how many more there are, for a "Show more" button. */
export function firstPage<T>(list: T[], limit: number): { items: T[]; remaining: number } {
  return { items: list.slice(0, limit), remaining: Math.max(0, list.length - limit) };
}
