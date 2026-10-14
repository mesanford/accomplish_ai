import { useState } from 'react';
import { LeadCard } from '../components/LeadCard';
import { Empty, Loading, Notice, PageHeader } from '../components/ui';
import { LEAD_STATUSES, useLeads } from '../lib/leads';
import { useTroop } from '../lib/troop';
import type { LeadStatus } from '../lib/types';

export function Recruiting() {
  const { troopId, isLeader } = useTroop();
  const leads = useLeads();
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');

  if (!isLeader) {
    return <Empty>Only troop leaders can see families who asked about the troop.</Empty>;
  }
  const shown = filter === 'all' ? leads.data : leads.data.filter((l) => l.status === filter);
  const count = (status: LeadStatus) => leads.data.filter((l) => l.status === status).length;
  return (
    <>
      <PageHeader eyebrow="Recruiting" title="Families who asked about the troop" />
      <p className="muted">
        These came from your troop website's Join us form. Reply by email or phone, then make an invite link to bring
        them into Trailhead.
      </p>
      <Notice kind="error">{leads.error}</Notice>
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="lead-filter">Show</label>
        <select id="lead-filter" value={filter} onChange={(e) => setFilter(e.target.value as LeadStatus | 'all')}>
          <option value="all">Everyone ({leads.data.length})</option>
          {LEAD_STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label} ({count(value)})
            </option>
          ))}
        </select>
      </div>
      {leads.loading ? <Loading /> : null}
      {!leads.loading && shown.length === 0 ? (
        <Empty>
          {leads.data.length === 0
            ? 'No one has asked yet. When a family fills in the Join us form on your website, they appear here.'
            : 'No families with that status.'}
        </Empty>
      ) : null}
      <ul className="grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.map((lead) => (
          <LeadCard key={lead.id} lead={lead} troopId={troopId} />
        ))}
      </ul>
    </>
  );
}
