import { describe, expect, it } from 'vitest';
import {
  available,
  checkOutProblem,
  daysOverdue,
  filterItems,
  type InventoryItem,
  isOverdue,
  NO_FILTER,
  stockText,
} from '../equipment';
import { EMPTY_FORM, formProblem, itemFields, parseCost } from '../equipmentForm';
import { cell, checkoutsCsv, INVENTORY_HEADER, inventoryCsv } from '../equipmentCsv';
import { fitWithin } from '../photo';
import { ADULT_ROLES, ROLE_LABELS, roleList } from '../roles';

const kit = (more: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'kits',
  name: 'Mess kit',
  category: 'cooking',
  quantity: 12,
  condition: 'good',
  out: 0,
  ...more,
});
const tent = kit({ id: 'tent', name: 'Tent 4', category: 'tents', quantity: 1, tag: 'T-4', location: 'Trailer' });

describe('quantity math', () => {
  it('is the quantity less what is out, never below zero', () => {
    expect(available(kit({ out: 5 }))).toBe(7);
    expect(available(kit({ out: undefined }))).toBe(12);
    expect(available(kit({ quantity: 3, out: 9 }))).toBe(0);
  });

  it('refuses to check out more than is on the shelf', () => {
    const mostlyOut = kit({ out: 10 });
    expect(checkOutProblem(mostlyOut, 2)).toBeNull();
    expect(checkOutProblem(mostlyOut, 3)).toBe('Only 2 on the shelf. Check out 2 or fewer.');
    expect(checkOutProblem(kit({ out: 12 }), 1)).toBe('None of this item is on the shelf.');
    expect(checkOutProblem(tent, 1)).toBeNull();
    expect(checkOutProblem({ ...tent, out: 1 }, 1)).not.toBeNull();
  });

  it('refuses a retired item and a quantity that is not a whole number', () => {
    expect(checkOutProblem(kit({ condition: 'retired' }), 1)).toMatch(/retired/);
    expect(checkOutProblem(kit({ condition: 'needs_repair' }), 1)).toBeNull();
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(checkOutProblem(kit(), bad)).toBe('Enter how many, as a whole number.');
    }
  });

  it('describes the stock for a set and for a single item', () => {
    expect(stockText(kit({ out: 5 }))).toBe('7 of 12 on the shelf');
    expect(stockText(tent)).toBe('On the shelf');
    expect(stockText({ ...tent, out: 1 })).toBe('Out');
  });
});

describe('overdue', () => {
  const loan = { status: 'out' as const, dueDate: '2026-10-17' };
  it('treats the due date itself as on time and the day after as late', () => {
    expect(isOverdue(loan, '2026-10-17')).toBe(false);
    expect(isOverdue(loan, '2026-10-18')).toBe(true);
    expect(daysOverdue(loan, '2026-10-24')).toBe(7);
    expect(daysOverdue(loan, '2026-10-16')).toBe(0);
  });

  it('never counts a returned loan', () => {
    expect(isOverdue({ status: 'returned', dueDate: '2020-01-01' }, '2026-10-17')).toBe(false);
  });

  it('counts days across a month end', () => {
    expect(daysOverdue({ status: 'out', dueDate: '2026-09-29' }, '2026-10-02')).toBe(3);
  });
});

describe('catalog filters', () => {
  const items = [kit({ out: 12 }), tent, kit({ id: 'k2', name: 'Lantern', category: 'tools', condition: 'needs_repair', notes: 'Bad mantle' })];
  it('searches name, tag, place and notes, all words', () => {
    expect(filterItems(items, { ...NO_FILTER, search: 't-4' }).map((i) => i.id)).toEqual(['tent']);
    expect(filterItems(items, { ...NO_FILTER, search: 'trailer tent' }).map((i) => i.id)).toEqual(['tent']);
    expect(filterItems(items, { ...NO_FILTER, search: 'mantle' }).map((i) => i.name)).toEqual(['Lantern']);
    expect(filterItems(items, { ...NO_FILTER, search: 'zzz' })).toEqual([]);
  });

  it('narrows by category, condition and what is on the shelf, sorted by name', () => {
    expect(filterItems(items, { ...NO_FILTER, category: 'tools' }).map((i) => i.name)).toEqual(['Lantern']);
    expect(filterItems(items, { ...NO_FILTER, condition: 'needs_repair' })).toHaveLength(1);
    expect(filterItems(items, { ...NO_FILTER, onlyAvailable: true }).map((i) => i.name)).toEqual(['Lantern', 'Tent 4']);
    expect(filterItems(items, NO_FILTER).map((i) => i.name)).toEqual(['Lantern', 'Mess kit', 'Tent 4']);
  });
});

describe('item form', () => {
  const form = { ...EMPTY_FORM, name: ' Tent 4 ', quantity: '1', tag: ' T-4 ', cost: '$1,129.50' };
  it('reads dollars as cents', () => {
    expect(parseCost('129.00')).toBe(12900);
    expect(parseCost('$1,129.5')).toBe(112950);
    expect(parseCost('')).toBeNull();
    expect(parseCost('12.345')).toBeNull();
    expect(parseCost('free')).toBeNull();
  });

  it('leaves empty optional fields out', () => {
    expect(itemFields(form)).toMatchObject({ name: 'Tent 4', tag: 'T-4', costCents: 112950, quantity: 1 });
    const bare = itemFields({ ...EMPTY_FORM, name: 'Rope' });
    expect(bare).not.toHaveProperty('tag');
    expect(bare).not.toHaveProperty('costCents');
    expect(bare).not.toHaveProperty('purchaseDate');
  });

  it('checks the form, and keeps the quantity at or above what is out', () => {
    expect(formProblem(form, 0)).toBeNull();
    expect(formProblem({ ...form, name: ' ' }, 0)).toMatch(/name/);
    expect(formProblem({ ...form, quantity: '0' }, 0)).toMatch(/Quantity/);
    expect(formProblem({ ...form, quantity: '1.5' }, 0)).toMatch(/Quantity/);
    expect(formProblem({ ...form, quantity: '3' }, 5)).toMatch(/5 are checked out/);
    expect(formProblem({ ...form, cost: 'lots' }, 0)).toMatch(/dollars/);
  });
});

describe('csv', () => {
  it('escapes quotes and commas, and defuses formulas', () => {
    expect(cell('plain')).toBe('plain');
    expect(cell('a, b')).toBe('"a, b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(cell('@home')).toBe("'@home");
    expect(cell('-5 degree tent')).toBe("'-5 degree tent");
    expect(cell(12)).toBe('12');
    expect(cell(undefined)).toBe('');
  });

  it('lists every item with plain-dollar costs, sorted by name', () => {
    const csv = inventoryCsv([tent, kit({ out: 5, costCents: 8900, notes: 'Has "lids", all' })]);
    const [head, first, second] = csv.trim().split('\r\n');
    expect(head).toBe(INVENTORY_HEADER.join(','));
    expect(first).toBe('Mess kit,Cooking,,12,5,7,,Good,,89.00,"Has ""lids"", all"');
    expect(second).toBe('Tent 4,Tents,T-4,1,0,1,Trailer,Good,,,');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('lists only what is still out, soonest due first, with days overdue', () => {
    const base = { itemId: 'kits', itemName: 'Mess kit', quantity: 2, toKind: 'member' as const };
    const csv = checkoutsCsv(
      [
        { ...base, id: 'a', toLabel: 'Sam', dueDate: '2026-10-20', status: 'out' },
        { ...base, id: 'b', toLabel: 'Fall campout', toKind: 'event', dueDate: '2026-10-10', status: 'out' },
        { ...base, id: 'c', toLabel: 'Ava', dueDate: '2026-09-01', status: 'returned' },
      ],
      '2026-10-17',
    );
    const rows = csv.trim().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe('Mess kit,,2,Fall campout,Event,2026-10-10,7');
    expect(rows[2]).toBe('Mess kit,,2,Sam,Person,2026-10-20,0');
  });

  it('protects a name that starts with a formula character', () => {
    const csv = checkoutsCsv(
      [{ id: 'a', itemId: 'x', itemName: 'Axe', quantity: 1, toKind: 'member', toLabel: '=cmd', dueDate: '2026-10-20', status: 'out' }],
      '2026-10-17',
    );
    expect(csv).toContain("'=cmd");
  });
});

describe('quartermaster role', () => {
  it('is listed for adults between treasurer and parent', () => {
    expect(ADULT_ROLES.indexOf('quartermaster')).toBe(ADULT_ROLES.indexOf('treasurer') + 1);
    expect(ROLE_LABELS.quartermaster).toBe('Quartermaster');
    expect(roleList(['parent', 'quartermaster'])).toBe('Quartermaster and parent');
    expect(roleList(['scout', 'quartermaster'])).toBe('Quartermaster');
  });
});

describe('photo size', () => {
  it('shrinks the longest side to the cap and never scales up', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
