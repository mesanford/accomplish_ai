import type { Timestamp } from 'firebase/firestore';

/** The troop's gear and library. Items are written by the quartermaster and leaders; loans and requests only by the server. */

export type ItemCategory = 'tents' | 'cooking' | 'tools' | 'first_aid' | 'library' | 'other';
export type ItemCondition = 'good' | 'needs_repair' | 'retired';

export const CATEGORIES: [ItemCategory, string][] = [
  ['tents', 'Tents'],
  ['cooking', 'Cooking'],
  ['tools', 'Tools'],
  ['first_aid', 'First aid'],
  ['library', 'Library books and merit badge pamphlets'],
  ['other', 'Other'],
];

export const CONDITIONS: [ItemCondition, string][] = [
  ['good', 'Good'],
  ['needs_repair', 'Needs repair'],
  ['retired', 'Retired'],
];

export const categoryLabel = (c: string) => CATEGORIES.find(([id]) => id === c)?.[1] ?? 'Other';
export const conditionLabel = (c: string) => CONDITIONS.find(([id]) => id === c)?.[1] ?? c;

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  tag?: string;
  location?: string;
  condition: ItemCondition;
  purchaseDate?: string;
  costCents?: number;
  notes?: string;
  /** How many are checked out. Written only by the server. */
  out?: number;
  /** The photo in Cloud Storage. Written only by the server. */
  photoPath?: string;
}

export interface Checkout {
  id: string;
  itemId: string;
  itemName: string;
  itemTag?: string;
  quantity: number;
  toKind: 'member' | 'event';
  toLabel: string;
  toMemberId?: string;
  eventId?: string;
  scoutId?: string;
  dueDate: string;
  status: 'out' | 'returned';
  note?: string;
  outAt?: Timestamp;
  returnedAt?: Timestamp;
  returnCondition?: ItemCondition;
  returnNote?: string;
  /** True once the person's records were erased; `toLabel` then says "Former Scout" or "Former member". */
  holderFormer?: boolean;
}

export interface EquipmentRequest {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  eventId: string;
  eventTitle: string;
  eventStart?: string;
  note?: string;
  status: 'pending' | 'approved' | 'declined';
  requestedByName: string;
  createdAt?: Timestamp;
  decisionNote?: string;
}

export interface MaintenanceNote {
  id: string;
  itemId: string;
  kind: 'repair' | 'note' | 'returned';
  note: string;
  date: string;
  costCents?: number;
  byMemberId?: string;
  createdAt?: Timestamp;
}

/** How many are on the shelf: the quantity less what is out, never below zero. */
export const available = (item: Pick<InventoryItem, 'quantity' | 'out'>): number =>
  Math.max(0, item.quantity - (item.out ?? 0));

/** Why this many can't go out now, or null. The server checks again; this keeps the form honest. */
export function checkOutProblem(item: InventoryItem, quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return 'Enter how many, as a whole number.';
  }
  if (item.condition === 'retired') {
    return 'This item is retired. Change its condition before checking it out.';
  }
  const left = available(item);
  if (left === 0) {
    return 'None of this item is on the shelf.';
  }
  return quantity > left ? `Only ${left} on the shelf. Check out ${left} or fewer.` : null;
}

/** Still out and past its due date. Due today is not late. `today` is YYYY-MM-DD. */
export const isOverdue = (c: Pick<Checkout, 'status' | 'dueDate'>, today: string): boolean =>
  c.status === 'out' && Boolean(c.dueDate) && c.dueDate < today;

export function daysOverdue(c: Pick<Checkout, 'status' | 'dueDate'>, today: string): number {
  if (!isOverdue(c, today)) {
    return 0;
  }
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.dueDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export interface CatalogFilter {
  search: string;
  category: ItemCategory | '';
  condition: ItemCondition | '';
  onlyAvailable: boolean;
}

export const NO_FILTER: CatalogFilter = { search: '', category: '', condition: '', onlyAvailable: false };

/** Items matching the search (name, tag, location, notes) and filters, sorted by name. */
export function filterItems(items: InventoryItem[], f: CatalogFilter): InventoryItem[] {
  const words = f.search.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((i) => {
      const text = [i.name, i.tag, i.location, i.notes].join(' ').toLowerCase();
      return (
        words.every((w) => text.includes(w)) &&
        (!f.category || i.category === f.category) &&
        (!f.condition || i.condition === f.condition) &&
        (!f.onlyAvailable || available(i) > 0)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "3 of 12 on the shelf", or "Out" for a single item that is out. */
export function stockText(i: InventoryItem): string {
  if (i.quantity === 1) {
    return available(i) === 1 ? 'On the shelf' : 'Out';
  }
  return `${available(i)} of ${i.quantity} on the shelf`;
}
