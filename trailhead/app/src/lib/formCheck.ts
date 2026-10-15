/** "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * A plain message naming the empty required fields, or null when all are filled in.
 * Each entry is [what to call it in the message, its value].
 */
export function stillNeeded(fields: [string, string | undefined | null][]): string | null {
  const empty = fields.filter(([, value]) => !value?.trim()).map(([label]) => label);
  return empty.length > 0 ? `Still needed: ${joinList(empty)}.` : null;
}
