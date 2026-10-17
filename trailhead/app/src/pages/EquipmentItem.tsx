import { deleteDoc, doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckOutForm } from '../components/equipment/CheckOutForm';
import { ItemForm } from '../components/equipment/ItemForm';
import { ItemPhoto } from '../components/equipment/ItemPhoto';
import { LoanList } from '../components/equipment/LoanList';
import { MaintenanceLog } from '../components/equipment/MaintenanceLog';
import { RequestForm } from '../components/equipment/RequestForm';
import { Empty, formatDate, Loading, Notice, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/api';
import { available, categoryLabel, conditionLabel, stockText } from '../lib/equipment';
import { useAllCheckouts, useCanManageGear, useInventory } from '../lib/equipmentHooks';
import { db } from '../lib/firebase';
import { useTroop } from '../lib/troop';

/** One item: its details, who has it, and (for the quartermaster and leaders) check-out, edit and the repair log. */
export function EquipmentItem() {
  const { itemId = '' } = useParams();
  const { troopId } = useTroop();
  const manage = useCanManageGear();
  const navigate = useNavigate();
  const inventory = useInventory();
  const loans = useAllCheckouts();
  const [mode, setMode] = useState<'view' | 'edit' | 'out'>('view');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const item = inventory.data.find((i) => i.id === itemId);
  const mine = useMemo(() => loans.data.filter((c) => c.itemId === itemId), [loans.data, itemId]);

  if (inventory.loading) {
    return <Loading />;
  }
  if (!item) {
    return (
      <Empty>
        That item isn't in the inventory. <Link to={`/t/${troopId}/equipment`}>Back to equipment</Link>
      </Empty>
    );
  }
  async function remove() {
    try {
      await deleteDoc(doc(db, 'troops', troopId, 'inventory', itemId));
      navigate(`/t/${troopId}/equipment`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const details: [string, string][] = [
    ['Category', categoryLabel(item.category)],
    ['Asset tag', item.tag ?? ''],
    ['Quantity', String(item.quantity)],
    ['On the shelf', stockText(item)],
    ['Location', item.location ?? ''],
    ['Condition', conditionLabel(item.condition)],
    ['Purchased', item.purchaseDate ? formatDate(item.purchaseDate) : ''],
    ['Cost', item.costCents === undefined ? '' : `$${(item.costCents / 100).toFixed(2)}`],
  ];

  return (
    <>
      <PageHeader eyebrow="Equipment" title={item.name}>
        {manage && mode === 'view' ? (
          <>
            <button type="button" className="btn small" disabled={available(item) === 0 || item.condition === 'retired'} onClick={() => setMode('out')}>
              Check out
            </button>
            <button type="button" className="btn quiet small" onClick={() => setMode('edit')}>
              Change {item.name}
            </button>
          </>
        ) : null}
      </PageHeader>
      <p className="small no-print">
        <Link to={`/t/${troopId}/equipment`}>All equipment</Link>
      </p>
      <Notice kind="error">{error}</Notice>
      {mode === 'edit' ? <ItemForm item={item} onDone={() => setMode('view')} onCancel={() => setMode('view')} /> : null}
      {mode === 'out' ? <CheckOutForm item={item} onDone={() => setMode('view')} /> : null}
      <ItemPhoto itemId={item.id} name={item.name} photoPath={item.photoPath} manage={manage} />
      <dl className="card" style={{ margin: 0 }}>
        {details
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="row spread">
              <dt className="muted">{k}</dt>
              <dd style={{ margin: 0 }}>{v}</dd>
            </div>
          ))}
        {item.notes ? <p style={{ margin: 0 }}>{item.notes}</p> : null}
      </dl>
      {manage ? (
        <section className="stack" aria-label="Checked out">
          <h2>Checked out</h2>
          <LoanList loans={mine} manage showItem={false} empty="None of this item is checked out." />
        </section>
      ) : item.condition !== 'retired' ? (
        <RequestForm item={item} />
      ) : null}
      {manage ? <MaintenanceLog itemId={item.id} /> : null}
      {manage && mode === 'view' ? (
        <div className="row no-print">
          {confirming ? (
            <>
              <button type="button" className="btn danger small" onClick={remove}>
                Yes, delete {item.name}
              </button>
              <button type="button" className="btn quiet small" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn quiet small" onClick={() => setConfirming(true)}>
              Delete {item.name}
            </button>
          )}
          {(item.out ?? 0) > 0 ? <span className="muted small">Check in what is out before deleting.</span> : null}
        </div>
      ) : null}
    </>
  );
}
