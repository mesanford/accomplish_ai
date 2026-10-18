import { useState } from 'react';
import { Catalog } from '../components/equipment/Catalog';
import { ItemForm } from '../components/equipment/ItemForm';
import { LoanList } from '../components/equipment/LoanList';
import { MyLoans } from '../components/equipment/MyLoans';
import { PrintSheet } from '../components/equipment/PrintSheet';
import { RequestList } from '../components/equipment/RequestList';
import { Loading, Notice, PageHeader, todayIso } from '../components/ui';
import { isOverdue } from '../lib/equipment';
import { checkoutsCsv, inventoryCsv } from '../lib/equipmentCsv';
import { useAllCheckouts, useCanManageGear, useInventory, useRequests } from '../lib/equipmentHooks';
import { downloadCsv } from '../lib/scoutbook';
import { HelpTip } from '../components/HelpTip';
import { SPREADSHEET_TIP } from '../lib/moreStatusTips';

type Tab = 'catalog' | 'out' | 'requests';

/** The troop's gear and library: the catalog everyone can search, and for the quartermaster and leaders, what is out. */
export function Equipment() {
  const manage = useCanManageGear();
  const inventory = useInventory();
  const loans = useAllCheckouts();
  const requests = useRequests();
  const [tab, setTab] = useState<Tab>('catalog');
  const [adding, setAdding] = useState(false);
  const today = todayIso();
  const overdue = loans.data.filter((c) => isOverdue(c, today)).length;
  const waiting = requests.data.filter((r) => r.status === 'pending').length;
  const tabs: [Tab, string][] = manage
    ? [
        ['catalog', 'Catalog'],
        ['out', overdue > 0 ? `Checked out (${overdue} overdue)` : 'Checked out'],
        ['requests', waiting > 0 ? `Requests (${waiting})` : 'Requests'],
      ]
    : [
        ['catalog', 'Catalog'],
        ['out', 'Checked out to you'],
        ['requests', 'Your requests'],
      ];

  return (
    <>
      <PageHeader eyebrow="Troop" title="Equipment">
        <HelpTip topic="equipment" />
        {manage ? (
          <>
            <button type="button" className="btn small no-print" onClick={() => setAdding(true)}>
              Add an item
            </button>
            <button type="button" className="btn quiet small no-print" title={SPREADSHEET_TIP} onClick={() => downloadCsv(`inventory-${today}.csv`, inventoryCsv(inventory.data))}>
              Download inventory
            </button>
            <button type="button" className="btn quiet small no-print" title={SPREADSHEET_TIP} onClick={() => downloadCsv(`checkouts-${today}.csv`, checkoutsCsv(loans.data, today))}>
              Download check-outs
            </button>
            <button type="button" className="btn quiet small no-print" onClick={() => window.print()}>
              Print list
            </button>
          </>
        ) : null}
      </PageHeader>
      <p className="muted no-print">
        {manage ? 'The troop’s tents, cooking gear, tools and library books. Check items out and in here.' : 'See what the troop owns. Open an item to ask for it for an event.'}
      </p>
      <Notice kind="error">{inventory.error || loans.error || requests.error}</Notice>
      {overdue > 0 && manage ? <Notice kind="warn">{overdue === 1 ? '1 item is overdue.' : `${overdue} items are overdue.`}</Notice> : null}
      {adding ? <ItemForm item={null} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} /> : null}
      <div className="row no-print" role="group" aria-label="Equipment sections">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'btn small' : 'btn quiet small'} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {inventory.loading ? <Loading /> : null}
      <div className="screen-only stack">
        {tab === 'catalog' ? <Catalog items={inventory.data} /> : null}
        {tab === 'out' && manage ? <LoanList loans={loans.data} manage empty="Nothing is checked out." /> : null}
        {tab === 'out' && !manage ? <MyLoans /> : null}
        {tab === 'requests' ? <RequestList requests={requests.data} manage={manage} /> : null}
      </div>
      <PrintSheet items={inventory.data} loans={loans.data} />
    </>
  );
}
