/** "1 badge", "2 badges". Pass the plural when adding "s" is wrong ("1 person", "2 people"). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "is" or "are" to match a count: "Only 1 requirement is signed". */
export function isAre(n: number): string {
  return n === 1 ? 'is' : 'are';
}
