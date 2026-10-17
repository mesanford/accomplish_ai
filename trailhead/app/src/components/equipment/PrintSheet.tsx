import { available, categoryLabel, type Checkout, conditionLabel, type InventoryItem } from '../../lib/equipment';
import { useTroop } from '../../lib/troop';
import { formatDate, todayIso } from '../ui';

/** The printable inventory. Hidden on screen; the print stylesheet shows it and hides the rest of the page. */
export function PrintSheet({ items, loans }: { items: InventoryItem[]; loans: Checkout[] }) {
  const { troop } = useTroop();
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const out = loans.filter((c) => c.status === 'out');
  return (
    <section className="print-only" aria-hidden="true">
      <h1>
        {troop ? `${troop.name}, Unit ${troop.unitNumber}` : 'Troop'} equipment list
      </h1>
      <p>Printed {formatDate(todayIso())}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Tag</th>
            <th scope="col">Category</th>
            <th scope="col">Qty</th>
            <th scope="col">Out</th>
            <th scope="col">On shelf</th>
            <th scope="col">Location</th>
            <th scope="col">Condition</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>{i.tag}</td>
              <td>{categoryLabel(i.category)}</td>
              <td>{i.quantity}</td>
              <td>{i.out ?? 0}</td>
              <td>{available(i)}</td>
              <td>{i.location}</td>
              <td>{conditionLabel(i.condition)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {out.length > 0 ? (
        <>
          <h2>Checked out</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Qty</th>
                <th scope="col">To</th>
                <th scope="col">Due</th>
              </tr>
            </thead>
            <tbody>
              {out.map((c) => (
                <tr key={c.id}>
                  <td>{c.itemName}</td>
                  <td>{c.quantity}</td>
                  <td>{c.toLabel}</td>
                  <td>{formatDate(c.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
