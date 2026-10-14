import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { createInvite, errorMessage } from '../lib/api';
import { db } from '../lib/firebase';
import { LEAD_STATUSES, leadStatusLabel } from '../lib/leads';
import type { Lead, LeadStatus } from '../lib/types';
import { formatDate, Notice } from './ui';

const TONES: Record<LeadStatus, string> = {
  new: 'warn',
  contacted: 'neutral',
  invited: 'neutral',
  joined: 'good',
  not_interested: 'bad',
};

function scoutLine(lead: Lead): string {
  if (lead.scoutAge) {
    return `Scout age ${lead.scoutAge}`;
  }
  return lead.grade ? `Scout grade: ${lead.grade}` : 'Scout age or grade not given';
}

function InviteLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${path}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="stack">
      <span className="small muted">Send this link to the family. It works once and expires in 30 days.</span>
      <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
      <div>
        <button type="button" className="btn secondary small" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

export function LeadCard({ lead, troopId }: { lead: Lead; troopId: string }) {
  const ref = doc(db, 'troops', troopId, 'leads', lead.id);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function change(fields: { status?: LeadStatus; notes?: string }) {
    setError('');
    setSaved(false);
    try {
      await updateDoc(ref, fields);
      setSaved(Boolean(fields.notes !== undefined));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function invite() {
    setError('');
    try {
      await createInvite({ troopId, role: 'parent', leadId: lead.id });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li className="card">
      <div className="row spread">
        <h3>{lead.name}</h3>
        <span className={`pill ${TONES[lead.status]}`}>{leadStatusLabel(lead.status)}</span>
      </div>
      <div className="small">
        <a href={`mailto:${lead.email}`}>{lead.email}</a>
        {lead.phone ? <span> · {lead.phone}</span> : null}
      </div>
      <div className="small muted">
        {scoutLine(lead)}
        {lead.createdAt ? ` · Asked on ${formatDate(lead.createdAt.toDate().toISOString())}` : ''}
      </div>
      {lead.message ? <p style={{ whiteSpace: 'pre-line' }}>{lead.message}</p> : null}
      <div className="field">
        <label htmlFor={`status-${lead.id}`}>Status</label>
        <select
          id={`status-${lead.id}`}
          value={lead.status}
          onChange={(e) => change({ status: e.target.value as LeadStatus })}
        >
          {LEAD_STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`notes-${lead.id}`}>Notes for leaders</label>
        <textarea
          id={`notes-${lead.id}`}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== lead.notes && change({ notes })}
        />
        <span className="hint">{saved ? 'Notes saved.' : 'Saved when you click away.'}</span>
      </div>
      {lead.invitePath ? <InviteLink path={lead.invitePath} /> : null}
      <div>
        <button type="button" className="btn small" onClick={invite}>
          {lead.invitePath ? 'Make a new invite link' : 'Create invite link'}
        </button>
      </div>
      <Notice kind="error">{error}</Notice>
    </li>
  );
}
