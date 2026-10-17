import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  available,
  CATEGORIES,
  categoryLabel,
  CONDITIONS,
  conditionLabel,
  type CatalogFilter,
  filterItems,
  type InventoryItem,
  type ItemCategory,
  type ItemCondition,
  NO_FILTER,
  stockText,
} from '../../lib/equipment';
import { useTroop } from '../../lib/troop';
import { Empty } from '../ui';

function StockPill({ item }: { item: InventoryItem }) {
  const left = available(item);
  const tone = left === 0 ? 'bad' : left < item.quantity ? 'warn' : 'good';
  return <span className={`pill ${tone}`}>{stockText(item)}</span>;
}

/** The catalog: search by name, tag or place, and narrow by category, condition and what is on the shelf. */
export function Catalog({ items }: { items: InventoryItem[] }) {
  const { troopId } = useTroop();
  const [filter, setFilter] = useState<CatalogFilter>(NO_FILTER);
  const shown = filterItems(items, filter);
  const set = (patch: Partial<CatalogFilter>) => setFilter((f) => ({ ...f, ...patch }));
  return (
    <section className="stack" aria-label="Catalog">
      <div className="grid no-print">
        <div className="field">
          <label htmlFor="gear-search">Search</label>
          <input id="gear-search" placeholder="Name, tag or place" value={filter.search} onChange={(e) => set({ search: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="gear-category">Category</label>
          <select id="gear-category" value={filter.category} onChange={(e) => set({ category: e.target.value as ItemCategory | '' })}>
            <option value="">All categories</option>
            {CATEGORIES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gear-condition">Condition</label>
          <select id="gear-condition" value={filter.condition} onChange={(e) => set({ condition: e.target.value as ItemCondition | '' })}>
            <option value="">Any condition</option>
            {CONDITIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check no-print">
        <input type="checkbox" checked={filter.onlyAvailable} onChange={(e) => set({ onlyAvailable: e.target.checked })} />
        Only items on the shelf
      </label>
      <p className="small muted" role="status">
        {shown.length === 1 ? '1 item' : `${shown.length} items`}
      </p>
      {shown.length === 0 ? (
        <Empty>{items.length === 0 ? 'No items yet.' : 'No items match. Clear the search or the filters.'}</Empty>
      ) : (
        <ul className="list">
          {shown.map((i) => (
            <li key={i.id}>
              <span>
                <Link to={`/t/${troopId}/equipment/${i.id}`}>{i.name}</Link>
                {i.tag ? <span className="mono"> {i.tag}</span> : null}
                <span className="muted small">
                  {' '}
                  · {categoryLabel(i.category)}
                  {i.location ? ` · ${i.location}` : ''}
                </span>
              </span>
              <span className="row">
                {i.condition === 'good' ? null : <span className={`pill ${i.condition === 'retired' ? 'neutral' : 'warn'}`}>{conditionLabel(i.condition)}</span>}
                <StockPill item={i} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
