import { available, categoryLabel, type Checkout, conditionLabel, daysOverdue, type InventoryItem } from './equipment';

/** Spreadsheet exports for the gear list. Text that starts with = + - @ gets a leading apostrophe so a spreadsheet
 * never reads it as a formula; quotes, commas and line breaks are escaped. */
export function cell(value: string | number | undefined): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(header: string[], rows: (string | number | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const INVENTORY_HEADER = [
  'Name',
  'Category',
  'Asset tag',
  'Quantity',
  'Checked out',
  'On the shelf',
  'Location',
  'Condition',
  'Purchase date',
  'Cost',
  'Notes',
];

/** One line per item. The cost is plain dollars ("129.00") so a spreadsheet adds it up. */
export function inventoryCsv(items: InventoryItem[]): string {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  return toCsv(
    INVENTORY_HEADER,
    sorted.map((i) => [
      i.name,
      categoryLabel(i.category),
      i.tag,
      i.quantity,
      i.out ?? 0,
      available(i),
      i.location,
      conditionLabel(i.condition),
      i.purchaseDate,
      i.costCents === undefined ? '' : (i.costCents / 100).toFixed(2),
      i.notes,
    ]),
  );
}

export const CHECKOUT_HEADER = ['Item', 'Asset tag', 'Quantity', 'Checked out to', 'Type', 'Due', 'Overdue by days'];

/** One line per check-out that is still out, soonest due first. `today` is YYYY-MM-DD. */
export function checkoutsCsv(loans: Checkout[], today: string): string {
  const open = loans.filter((c) => c.status === 'out').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return toCsv(
    CHECKOUT_HEADER,
    open.map((c) => [
      c.itemName,
      c.itemTag,
      c.quantity,
      c.toLabel,
      c.toKind === 'event' ? 'Event' : 'Person',
      c.dueDate,
      daysOverdue(c, today),
    ]),
  );
}
