import type { InventoryItem, ItemCategory, ItemCondition } from './equipment';

/** The fields to save for an item: empty optional fields are left out, because the rules refuse blanks. */
export interface ItemForm {
  name: string;
  category: ItemCategory;
  quantity: string;
  tag: string;
  location: string;
  condition: ItemCondition;
  purchaseDate: string;
  cost: string;
  notes: string;
}

export const EMPTY_FORM: ItemForm = {
  name: '',
  category: 'other',
  quantity: '1',
  tag: '',
  location: '',
  condition: 'good',
  purchaseDate: '',
  cost: '',
  notes: '',
};

export const formFrom = (i: InventoryItem): ItemForm => ({
  name: i.name,
  category: i.category,
  quantity: String(i.quantity),
  tag: i.tag ?? '',
  location: i.location ?? '',
  condition: i.condition,
  purchaseDate: i.purchaseDate ?? '',
  cost: i.costCents === undefined ? '' : (i.costCents / 100).toFixed(2),
  notes: i.notes ?? '',
});

/** Dollars typed by a person to whole cents, or null when blank or not a price. */
export function parseCost(text: string): number | null {
  const clean = text.trim().replace(/^\$/, '').replace(/,/g, '');
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Math.round(Number(clean) * 100) : null;
}

/** What is wrong with the form, or null. `out` is how many are checked out now. */
export function formProblem(f: ItemForm, out: number): string | null {
  const quantity = Number(f.quantity);
  if (!f.name.trim()) {
    return 'Give the item a name.';
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    return 'Quantity must be a whole number from 1 to 1000.';
  }
  if (quantity < out) {
    return `${out} are checked out. Check some in before lowering the quantity below ${out}.`;
  }
  if (f.cost.trim() && parseCost(f.cost) === null) {
    return 'Enter the cost as dollars, like 129.00.';
  }
  return null;
}

export function itemFields(f: ItemForm) {
  const cost = parseCost(f.cost);
  return {
    name: f.name.trim().slice(0, 120),
    category: f.category,
    quantity: Number(f.quantity),
    condition: f.condition,
    notes: f.notes.trim().slice(0, 1000),
    location: f.location.trim().slice(0, 120),
    ...(f.tag.trim() ? { tag: f.tag.trim().slice(0, 40) } : {}),
    ...(f.purchaseDate ? { purchaseDate: f.purchaseDate } : {}),
    ...(cost === null ? {} : { costCents: cost }),
  };
}
