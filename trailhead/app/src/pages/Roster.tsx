import { collection } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AddScoutForm } from '../components/AddScoutForm';
import { InviteForm } from '../components/InviteForm';
import { GuideBlock } from '../components/GuideBlock';
import { HelpTip } from '../components/HelpTip';
import { NextStep } from '../components/NextStep';
import { Empty, Notice, PageHeader } from '../components/ui';
import { consentSummary } from '../lib/consent';
import { db } from '../lib/firebase';
import { useQuery } from '../lib/hooks';
import { useTroop } from '../lib/troop';
import type { ConsentDoc, Member } from '../lib/types';

function yptLabel(m: Member): { text: string; tone: string } | null {
  if (m.kind !== 'adult' || !(m.roles ?? []).some((r) => r !== 'parent')) {
    return null;
  }
  const expires = m.yptExpiresAt?.toDate();
  if (!expires) {
    return { text: 'No YPT on file', tone: 'bad' };
  }
  if (expires < new Date()) {
    return { text: 'YPT expired', tone: 'bad' };
  }
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  return expires < soon ? { text: 'YPT expires soon', tone: 'warn' } : { text: 'YPT current', tone: 'good' };
}

export function Roster() {
  const { troopId, members, memberName, isLeader } = useTroop();
  const [added, setAdded] = useState('');
  const consentsQuery = useMemo(() => (isLeader ? collection(db, `troops/${troopId}/consents`) : null), [isLeader, troopId]);
  const consents = useQuery<ConsentDoc>(consentsQuery, `${troopId}/consents/${isLeader}`);
  const scouts = members.filter((m) => m.kind === 'scout').sort((a, b) => a.displayName.localeCompare(b.displayName));
  const adults = members.filter((m) => m.kind === 'adult').sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!isLeader) {
    return <Empty>Only leaders can manage the roster.</Empty>;
  }
  const consentOf = (s: Member) =>
    consentSummary(
      consents.data.find((c) => c.id === s.id),
      (s.guardianIds ?? []).length > 0,
    );
  const withdrawn = scouts.filter((s) => consentOf(s).withdrawn);
  return (
    <>
      <PageHeader eyebrow="Troop" title="Roster" />
      <GuideBlock
        id="roster"
        purpose="The roster is everyone in your troop. Start here when you set up."
        steps={[
          'Add each Scout with the form on this page.',
          'Make an invite link for each parent, counselor or other leader.',
          'Send the link by text or email. They open it and join.',
        ]}
      />
      <section className="stack">
        <h2>Scouts ({scouts.length})</h2>
        {withdrawn.length > 0 ? (
          <Notice kind="warn">
            A parent withdrew consent. Remove these Scouts' records:{' '}
            {withdrawn.map((s, i) => (
              <span key={s.id}>
                {i > 0 ? ', ' : ''}
                <Link to={`/t/${troopId}/scouts/${s.id}`}>{s.displayName}</Link>
              </span>
            ))}
            .
          </Notice>
        ) : null}
        {scouts.length === 0 ? (
          <NextStep action="Go to the form" onClick={() => document.getElementById('scout-name')?.focus()}>No Scouts yet. Add your first Scout with the form below.</NextStep>
        ) : (
          <ul className="list">
            {scouts.map((s) => {
              const consent = consentOf(s);
              return (
                <li key={s.id}>
                  <Link to={`/t/${troopId}/scouts/${s.id}`}>{s.displayName}</Link>
                  <span className="muted small">
                    {(s.guardianIds ?? []).length > 0
                      ? `Parents: ${(s.guardianIds ?? []).map(memberName).join(', ')}`
                      : 'No parent on the app yet'}
                  </span>
                  <span className={`pill ${consent.tone}`}>{consent.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="stack">
        <h2>
          Adults ({adults.length})
          <HelpTip topic="ypt" />
        </h2>
        <ul className="list">
          {adults.map((a) => {
            const ypt = yptLabel(a);
            return (
              <li key={a.id}>
                <span>
                  {a.displayName} <span className="muted small">· {(a.roles ?? []).join(', ')}</span>
                </span>
                {ypt ? <span className={`pill ${ypt.tone}`}>{ypt.text}</span> : null}
              </li>
            );
          })}
        </ul>
      </section>
      <div className="grid" style={{ alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <section className="card">
          <h2>Add a Scout</h2>
          <AddScoutForm troopId={troopId} onAdded={setAdded} />
          {added ? (
            <Link className="small" to={`/t/${troopId}/scouts/${added}/earlier`}>
              Record {memberName(added)}'s earlier ranks and badges
            </Link>
          ) : null}
        </section>
        <section className="card">
          <h2>
            Invite someone
            <HelpTip topic="roles" />
          </h2>
          <InviteForm troopId={troopId} scouts={scouts} />
        </section>
      </div>
    </>
  );
}
